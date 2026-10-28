"""합성 파일/모의 adapter만 사용. 포털/브라우저/실제 CSV 내용에 접근하지 않음."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from xml.sax.saxutils import escape
from preflight import HEADERS, ROOT, inspect_files, execute_adapter

class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='rpa-local-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.excel = self.root/'등록자료.xlsx'
        self.catalog = json.loads((ROOT/'분류체계.json').read_text(encoding='utf-8'))
        self.pair = self.catalog['entries'][0]

    def make(self,count=1,sheet='등록대장',mutate=None,headers=None):
        rows = [HEADERS if headers is None else headers]
        for n in range(count):
            name = '합성자료'+str(n+1)
            (self.root/(name+'.csv')).write_text('명칭,수량\n가상,1',encoding='utf-8')
            rows.append([str(n+1),'미등록',name,'시설,운영시간','수시','가상시스템','가상DB',self.pair['major'],self.pair['minor'],'합성 확인 근거','한국어','직접등록','정형데이터','','','2','','','','','',name+'.csv',''])
        if mutate:
            mutate(rows)
        xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
        for n,row in enumerate(rows,1):
            xml += f'<row r="{n}">' + ''.join(f'<c r="{chr(65+i)}{n}" t="inlineStr"><is><t>{escape(str(v))}</t></is></c>' for i,v in enumerate(row))+'</row>'
        xml += '</sheetData></worksheet>'
        with zipfile.ZipFile(self.excel,'w') as z:
            z.writestr('xl/workbook.xml',f'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{sheet}" r:id="rId1"/></sheets></workbook>')
            z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
            z.writestr('xl/worksheets/sheet1.xml',xml)
        return inspect_files(self.excel,self.root)

    def edit_zip(self,name,replace):
        with zipfile.ZipFile(self.excel) as z:
            values={n:z.read(n) for n in z.namelist()}
        values[name]=replace(values.get(name,b''))
        with zipfile.ZipFile(self.excel,'w') as z:
            for n,v in values.items():
                z.writestr(n,v)

    def test_normal_1_5_10(self):
        for count in [1,5,10]:
            with self.subTest(count=count):
                r=self.make(count);self.assertTrue(r['can_register']);self.assertEqual(r['target_count'],count);self.assertEqual(r['normal_csv_count'],count);self.assertEqual(r['registration_status'],'not_executed')

    def test_missing_csv(self):
        self.make(5);(self.root/'합성자료3.csv').unlink();r=inspect_files(self.excel,self.root)
        self.assertFalse(r['can_register']);self.assertEqual(r['normal_csv_count'],4);self.assertEqual(r['missing_csv_count'],1);self.assertIn('합성자료3.csv',' '.join(r['errors']))

    def test_sheet_headers_extra_column_zero_over_limit(self):
        self.assertFalse(self.make(sheet='다른시트')['can_register'])
        self.assertFalse(self.make(headers=list(reversed(HEADERS)))['can_register'])
        self.assertFalse(self.make(headers=HEADERS+['추가열'])['can_register'])
        self.assertFalse(self.make(0)['can_register'])
        self.assertFalse(self.make(11)['can_register'])

    def test_filename_mismatch_and_required_fields(self):
        for index,value in [(1,'검토중'),(1,'등록완료'),(2,'다른이름'),(2,' 합성자료1'),(2,'합성자료1 '),(3,''),(7,''),(8,'없는분류'),(9,''),(21,'다른.csv')]:
            with self.subTest(index=index):
                self.assertFalse(self.make(mutate=lambda rows:rows[1].__setitem__(index,value))['can_register'])

    def test_wrong_workbook_filename(self):
        self.make();other=self.root/'등록자료 (14).xlsx';self.excel.rename(other)
        self.assertFalse(inspect_files(other,self.root)['can_register'])

    def test_duplicate_names_unsafe_paths_and_empty_csv(self):
        self.assertFalse(self.make(2,mutate=lambda r:r[2].__setitem__(2,r[1][2]))['can_register'])
        self.assertFalse(self.make(mutate=lambda r:r[1].__setitem__(2,'../외부자료'))['can_register'])
        self.make();(self.root/'합성자료1.csv').write_text('',encoding='utf-8');self.assertFalse(inspect_files(self.excel,self.root)['can_register'])

    def test_formula_and_external_sheet_rejected(self):
        self.make();self.edit_zip('xl/worksheets/sheet1.xml',lambda b:b.replace(b'<c r="C2"',b'<c r="C2"').replace(b'<c r="C2" t="inlineStr">',b'<c r="C2" t="inlineStr"><f>SECRET()</f>'))
        self.assertFalse(inspect_files(self.excel,self.root)['can_register'])
        self.make();self.edit_zip('xl/_rels/workbook.xml.rels',lambda b:b.replace(b'Target=',b'TargetMode="External" Target='));self.assertFalse(inspect_files(self.excel,self.root)['can_register'])

    def test_edited_excel_shared_strings(self):
        self.make();self.edit_zip('xl/worksheets/sheet1.xml',lambda b:b.replace('<c r="C2" t="inlineStr"><is><t>합성자료1</t></is></c>'.encode(),b'<c r="C2" t="s"><v>0</v></c>'))
        self.edit_zip('xl/sharedStrings.xml',lambda _:'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>합성자료1</t></si></sst>'.encode())
        self.assertTrue(inspect_files(self.excel,self.root)['can_register'])

    def test_bad_catalog_and_damage(self):
        self.make();self.assertFalse(inspect_files(self.excel,self.root,self.root/'missing.json')['can_register'])
        self.excel.write_bytes(b'not an Excel');self.assertFalse(inspect_files(self.excel,self.root)['can_register'])

    def adapter(self,body=''):
        path=self.root/'adapter.py';path.write_text(body,encoding='utf-8');return path

    def run_adapter(self,check,adapter,confirm=lambda _:'등록시작'):
        with contextlib.redirect_stdout(io.StringIO()):
            return execute_adapter(check,self.excel,self.root,adapter,self.root/'results',confirm)

    def test_original_adapter_not_connected_and_no_fake_success(self):
        code,path=self.run_adapter(self.make(),ROOT/'rpa_adapter.py',confirm=lambda _:self.fail('미연결인데 확인을 요청함'))
        self.assertEqual(code,3);self.assertIsNone(path);self.assertFalse((self.root/'results').exists())

    def test_confirmation_before_import(self):
        marker=self.root/'should-not-exist'
        adapter=self.adapter("CONFIGURED=True\nfrom pathlib import Path\nPath("+repr(str(marker))+ ").write_text('executed')\n")
        code,path=self.run_adapter(self.make(),adapter,confirm=lambda _:'취소')
        self.assertEqual(code,4);self.assertFalse(marker.exists());self.assertIsNone(path)

    def test_failed_preflight_never_imports_adapter(self):
        code,path=self.run_adapter(self.make(0),self.root/'missing.py');self.assertEqual(code,2);self.assertIsNone(path)

    def test_changed_files_after_check(self):
        r=self.make();adapter=self.adapter('CONFIGURED=True\ndef register_records(**kwargs): pass\n')
        def confirm(_):
            (self.root/'합성자료1.csv').unlink();return '등록시작'
        code,path=self.run_adapter(r,adapter,confirm);self.assertEqual(code,2);self.assertIsNone(path)

    def test_mock_success_requires_actual_confirmation_flag(self):
        adapter=self.adapter("CONFIGURED=True\ndef register_records(**k):\n k['report_started'](2)\n k['report_result'](2,True)\n")
        code,path=self.run_adapter(self.make(),adapter);report=json.loads(path.read_text(encoding='utf-8'));self.assertEqual(code,5);self.assertIsNone(report['records'][0]['success']);self.assertEqual(report['records'][0]['reason_code'],'PORTAL_RESULT_NOT_CONFIRMED');self.assertIsNotNone(report['records'][0]['started_at'])

    def test_mock_confirmed_success_and_safe_failure_log(self):
        adapter=self.adapter("CONFIGURED=True\ndef register_records(**k):\n k['report_started'](2)\n k['report_result'](2,True,portal_confirmed=True)\n k['report_started'](3)\n k['report_result'](3,False,'synthetic-secret-cookie')\n raise RuntimeError('synthetic-secret-password')\n")
        code,path=self.run_adapter(self.make(2),adapter);text=path.read_text(encoding='utf-8');report=json.loads(text);self.assertEqual(code,5);self.assertTrue(report['records'][0]['success']);self.assertFalse(report['records'][1]['success']);self.assertNotIn('synthetic-secret',text);self.assertNotIn('가상,1',text)

if __name__=='__main__':
    unittest.main()
