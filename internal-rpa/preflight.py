"""표준 라이브러리만 쓰는 로컬 사전검사. 네트워크/포털 접속 기능 없음."""
import argparse
import ast
import contextlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import unicodedata
import uuid
import zipfile
from datetime import datetime
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
HEADERS = ['No','등록상태','데이터명','키워드','갱신주기','정보시스템명','데이터베이스','분류대','분류중','보유근거','데이터언어','수집유형','데이터유형','실제DB테이블명','DB테이블설명','DB컬럼수','K값','K적용컬럼추천','L값','L적용컬럼추천','데이터기준일','기존파일명','비고']

class CheckError(Exception):
    pass

def _xml(archive, name):
    try:
        info = archive.getinfo(name)
        if info.file_size > 2 * 1024 * 1024:
            raise CheckError('Excel XML 크기 제한을 초과했습니다.')
        data = archive.read(name)
        if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
            raise CheckError('외부 선언이 있는 Excel은 지원하지 않습니다.')
        return ET.fromstring(data)
    except (KeyError, ET.ParseError, zipfile.BadZipFile):
        raise CheckError('Excel 내부 구조를 읽지 못했습니다.') from None

def read_register(path):
    """Excel 수정 후 공유 문자열도 처리하되 수식/외부 관계는 허용하지 않음."""
    try:
        if path.name != '등록자료.xlsx':
            raise CheckError('파일명은 등록자료.xlsx여야 합니다. 다운로드 번호가 붙었다면 이름을 확인하세요.')
        if not path.is_file() or path.stat().st_size > 8 * 1024 * 1024:
            raise CheckError('Excel 파일이 없거나 8MB 제한을 초과했습니다.')
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > 2000 or sum(i.file_size for i in entries) > 16 * 1024 * 1024:
                raise CheckError('Excel 압축 해제 크기 제한을 초과했습니다.')
            book = _xml(archive, 'xl/workbook.xml')
            sheet = next((s for s in book.findall(NS+'sheets/'+NS+'sheet') if s.get('name') == '등록대장'), None)
            if sheet is None:
                raise CheckError('등록대장 시트가 필요합니다.')
            rid = sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            rels = _xml(archive, 'xl/_rels/workbook.xml.rels')
            rel = next((r for r in rels if r.get('Id') == rid), None)
            if rel is None or rel.get('TargetMode') == 'External':
                raise CheckError('등록대장 시트 연결을 확인하세요.')
            target = rel.get('Target', '')
            name = target.lstrip('/') if target.startswith('/') else 'xl/'+target
            if '..' in PurePosixPath(name).parts or not name.startswith('xl/'):
                raise CheckError('허용되지 않는 Excel 시트 경로입니다.')
            shared = []
            if 'xl/sharedStrings.xml' in archive.namelist():
                shared = [''.join(e.itertext()) for e in _xml(archive, 'xl/sharedStrings.xml').findall(NS+'si')]
            cells = {}
            for row in _xml(archive, name).findall(NS+'sheetData/'+NS+'row'):
                for cell in row.findall(NS+'c'):
                    ref = cell.get('r', '')
                    if not re.fullmatch(r'[A-Z]+[1-9][0-9]*', ref) or ref in cells:
                        raise CheckError('Excel 셀 주소가 잘못되었거나 중복됩니다.')
                    if cell.find(NS+'f') is not None:
                        raise CheckError('등록대장에는 수식 대신 확정된 값을 입력하세요.')
                    if cell.get('t') == 'inlineStr':
                        value = ''.join(cell.find(NS+'is').itertext()) if cell.find(NS+'is') is not None else ''
                    else:
                        value = cell.findtext(NS+'v', '')
                        if cell.get('t') == 's':
                            try:
                                index = int(value)
                                if index < 0:
                                    raise ValueError()
                                value = shared[index]
                            except (ValueError, IndexError):
                                raise CheckError('Excel 공유 문자열 참조 오류입니다.') from None
                    if len(value) > 2500:
                        raise CheckError('Excel 셀 값의 길이 제한을 초과했습니다.')
                    cells[ref] = value
    except (OSError, zipfile.BadZipFile, RuntimeError):
        raise CheckError('Excel을 읽지 못했습니다. 파일 잠금·암호·손상 여부를 확인하세요.') from None
    if [cells.get(chr(65+i)+'1', '') for i in range(23)] != HEADERS:
        raise CheckError('A~W 23개 헤더와 순서가 기존 등록대장 양식과 일치해야 합니다.')
    for ref, value in cells.items():
        col, number = re.fullmatch(r'([A-Z]+)([0-9]+)', ref).groups()
        if value and (len(col) != 1 or col > 'W'):
            raise CheckError('등록대장에는 A~W 23개 열만 사용할 수 있습니다.')
        if value and int(number) > 11:
            raise CheckError('등록자료는 2~11행, 최대 10건만 지원합니다.')
    rows = []
    for number in range(2, 12):
        values = [cells.get(chr(65+i)+str(number), '') for i in range(23)]
        if any(values):
            if number != len(rows)+2:
                raise CheckError('데이터 행 사이의 빈 행을 제거하세요.')
            rows.append((number, values))
    if not rows:
        raise CheckError('등록 대상이 0건입니다.')
    return rows

def inspect_files(excel, csv_dir, catalog_path=ROOT/'분류체계.json'):
    result = {'phase':'preflight', 'registration_status':'not_executed', 'can_register':False,
              'target_count':0, 'normal_csv_count':0, 'missing_csv_count':0, 'errors':[], 'records':[]}
    try:
        excel, csv_dir = Path(excel).resolve(), Path(csv_dir).resolve()
        rows = read_register(excel)
        result['target_count'] = len(rows)
        result['_catalog_path'] = str(Path(catalog_path).resolve())
        try:
            catalog = json.loads(Path(catalog_path).read_text(encoding='utf-8-sig'))
            pairs = {(x['major'],x['minor']) for x in catalog['entries']}
            if len(pairs) != 77 or len({x[0] for x in pairs}) != 17:
                raise ValueError()
        except (OSError, KeyError, ValueError, TypeError):
            raise CheckError('함께 제공한 분류 목록을 읽지 못했습니다.') from None
        seen = set()
        for number, values in rows:
            name = values[2]
            errors = []
            if values[1] != '미등록':
                errors.append('B열은 미등록이어야 합니다. 이미 등록된 행·검토용 자료는 실행하지 않습니다.')
            for col, label in [(2,'데이터명'),(3,'키워드'),(7,'분류대'),(8,'분류중'),(9,'보유근거')]:
                if not values[col].strip() or re.search(r'확인\s*필요|미확인|추가 확인|검토 필요',values[col]):
                    errors.append(label+' 입력 필요')
            if (values[7],values[8]) not in pairs:
                errors.append('분류대·분류중 조합이 제공된 분류체계와 다릅니다.')
            valid_name = bool(name) and name == name.strip() and len(name) <= 240 and not re.search(r'[\\/:*?"<>|\x00-\x1f]',name) and name[-1:] not in ['.',' '] and not re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)',name,re.I)
            key = unicodedata.normalize('NFKC',name).casefold()
            if not valid_name:
                errors.append('C열 데이터명을 안전한 CSV 파일명으로 사용할 수 없습니다.')
            elif key in seen:
                errors.append('중복 데이터명입니다.')
            seen.add(key)
            if values[21] and values[21] != name+'.csv':
                errors.append('C열 데이터명과 V열 기존파일명이 다릅니다.')
            if valid_name:
                path = csv_dir/(name+'.csv')
                try:
                    path.resolve().relative_to(csv_dir)
                    exists = path.is_file()
                except (OSError, ValueError):
                    exists = False
                if not exists:
                    result['missing_csv_count'] += 1
                    errors.append('CSV 누락: '+name+'.csv')
                elif path.stat().st_size == 0:
                    errors.append('CSV 파일이 비어 있습니다: '+name+'.csv')
                else:
                    result['normal_csv_count'] += 1
            if errors:
                result['errors'].extend(f'{number}행: '+e for e in errors)
            result['records'].append({'row':number,'data_name':name,'csv_name':name+'.csv'})
        result['can_register'] = not result['errors']
    except CheckError as error:
        result['errors'].append(str(error))
    except OSError:
        result['errors'].append('작업 폴더와 파일 접근 권한을 확인하세요.')
    return result

REASONS = {'PORTAL_REJECTED','AUTH_REQUIRED','PORTAL_LAYOUT_CHANGED','RPA_ERROR','PORTAL_RESULT_NOT_CONFIRMED','NOT_PROCESSED'}
def execute_adapter(check, excel, csv_dir, adapter, output_dir, confirm=input):
    if not check['can_register']:
        return 2, None
    # 설정 여부는 실행 없이 읽습니다. 확인 전에 모듈 import가 Selenium을 시작하지 못하게 합니다.
    try:
        tree = ast.parse(Path(adapter).read_text(encoding='utf-8-sig'))
        configured = any(isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CONFIGURED' for t in n.targets) and isinstance(n.value,ast.Constant) and n.value.value is True for n in tree.body)
        if not configured:
            print('기존 Selenium RPA가 연결되지 않았습니다. 실제 등록은 실행하지 않았습니다.')
            return 3, None
    except Exception:
        print('RPA 연결 모듈을 읽지 못했습니다. 실제 등록은 실행하지 않았습니다.')
        return 3, None
    if confirm('실제 포털 등록을 시작하려면 등록시작 을 입력하세요: ').strip() != '등록시작':
        print('사용자가 등록 시작을 취소했습니다.')
        return 4, None
    current = inspect_files(excel,csv_dir,check.get('_catalog_path',ROOT/'분류체계.json'))
    if not current['can_register'] or current['records'] != check['records']:
        print('사전검사 이후 입력이 변경됐습니다. 검사부터 다시 실행하세요.')
        return 2, None
    try:
        spec = importlib.util.spec_from_file_location('internal_registration_adapter',adapter)
        module = importlib.util.module_from_spec(spec)
        with open(os.devnull,'w') as quiet, contextlib.redirect_stdout(quiet), contextlib.redirect_stderr(quiet):
            spec.loader.exec_module(module)
        if not getattr(module,'CONFIGURED',False) or not callable(getattr(module,'register_records',None)):
            print('RPA 연결 함수가 없습니다. 실제 등록은 실행하지 않았습니다.')
            return 3, None
    except Exception:
        print('RPA 연결 모듈을 읽지 못했습니다. 실제 등록은 실행하지 않았습니다.')
        return 3, None
    started = datetime.now().astimezone().isoformat(timespec='seconds')
    rows = {r['row']:{'data_name':r['data_name'],'started_at':None,'ended_at':None,'success':None,'reason_code':'NOT_PROCESSED'} for r in check['records']}
    def report_started(row):
        if type(row) is int and row in rows and rows[row]['started_at'] is None:
            rows[row]['started_at'] = datetime.now().astimezone().isoformat(timespec='seconds')
    def report_result(row, success, reason_code='', portal_confirmed=False):
        if type(row) is not int or row not in rows or rows[row]['ended_at'] is not None:
            return
        # 성공은 연결한 RPA가 실제 포털 결과를 확인했을 때만 허용합니다.
        verified_success = success is True and portal_confirmed is True
        rows[row].update(ended_at=datetime.now().astimezone().isoformat(timespec='seconds'),success=True if verified_success else False if success is False else None,
                         reason_code='' if verified_success else reason_code if reason_code in REASONS else 'PORTAL_RESULT_NOT_CONFIRMED')
    try:
        with open(os.devnull,'w') as quiet, contextlib.redirect_stdout(quiet), contextlib.redirect_stderr(quiet):
            module.register_records(excel_path=Path(excel).resolve(),csv_dir=Path(csv_dir).resolve(),records=check['records'],report_result=report_result,report_started=report_started)
    except Exception:
        for row in rows.values():
            if row['ended_at'] is None:
                row.update(ended_at=datetime.now().astimezone().isoformat(timespec='seconds'),success=False,reason_code='RPA_ERROR')
    for row in rows.values():
        if row['ended_at'] is None:
            row['ended_at'] = datetime.now().astimezone().isoformat(timespec='seconds')
    report = {'phase':'rpa_adapter','started_at':started,'preflight_passed':True,'records':list(rows.values())}
    output_dir = Path(output_dir);output_dir.mkdir(parents=True,exist_ok=True)
    destination = output_dir/('RPA_'+datetime.now().strftime('%Y%m%d_%H%M%S')+'_'+uuid.uuid4().hex[:8]+'.json')
    destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return (0 if all(r['success'] is True for r in rows.values()) else 5), destination

def main(argv=None):
    parser = argparse.ArgumentParser(description='Excel·CSV 사전검사. 실제 등록은 별도 기존 RPA 연결이 필요합니다.')
    parser.add_argument('--excel',type=Path,default=ROOT/'등록자료'/'등록자료.xlsx')
    parser.add_argument('--csv-dir',type=Path,default=ROOT/'등록자료')
    parser.add_argument('--catalog',type=Path,default=ROOT/'분류체계.json')
    parser.add_argument('--adapter',type=Path,default=ROOT/'rpa_adapter.py')
    parser.add_argument('--output-dir',type=Path,default=ROOT/'실행결과')
    parser.add_argument('--interactive',action='store_true')
    parser.add_argument('--run',action='store_true',help='검사 후 사용자 확인을 받아 연결한 기존 RPA 실행')
    args = parser.parse_args(argv)
    if args.interactive:
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk();root.withdraw()
            excel = filedialog.askopenfilename(title='등록자료.xlsx 선택',initialdir=args.excel.parent,filetypes=[('Excel','*.xlsx')])
            if not excel:
                root.destroy();return 4
            folder = filedialog.askdirectory(title='원본 CSV 파일 폴더 선택',initialdir=args.csv_dir)
            root.destroy()
            if not folder:
                return 4
            args.excel,args.csv_dir=Path(excel),Path(folder)
        except Exception:
            print('파일 선택창을 열지 못했습니다. --excel 및 --csv-dir 인자로 실행하세요.')
            return 2
    check = inspect_files(args.excel,args.csv_dir,args.catalog)
    print(f"등록 대상 {check['target_count']}건 / 정상 CSV {check['normal_csv_count']}개 / 누락 CSV {check['missing_csv_count']}개")
    print('사전검사: '+('통과 (등록 성공을 의미하지 않습니다.)' if check['can_register'] else '실패 — 등록을 시작하지 않습니다.'))
    for message in check['errors']:
        print(message)
    if not check['can_register']:
        return 2
    if not args.run:
        print('사전검사만 수행했습니다. 실제 포털 등록은 실행하지 않았습니다.')
        return 0
    code, destination = execute_adapter(check,args.excel,args.csv_dir,args.adapter,args.output_dir)
    if destination:
        print('실행 결과 파일: '+str(destination))
        print('실제 등록 성공 여부는 결과 파일 및 포털에서 확인하세요.')
    return code

if __name__ == '__main__':
    raise SystemExit(main())
