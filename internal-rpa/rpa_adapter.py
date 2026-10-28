"""기존 내부망 Selenium RPA를 연결할 진입점. 현재 실제 등록 기능은 미연결입니다."""
CONFIGURED = False

def register_records(*, excel_path, csv_dir, records, report_result, report_started):
    # 기존 RPA의 입력·경로·기록 방식을 확인한 후 이 함수 안에서 연결하세요.
    # records: [{'row': 2, 'data_name': '...', 'csv_name': '...csv'}, ...]
    # 개별 처리 시작 때 report_started(row)를 호출하세요.
    # 실제 포털 등록 결과를 확인한 뒤에만 호출:
    # report_result(row, True, portal_confirmed=True)
    # 실패 사유에는 고정 코드만 사용하고 예외문·암호·쿠키·원본 내용을 전달하지 마세요.
    raise RuntimeError('기존 내부망 RPA 미연결 — 실제 등록은 구현하지 않았습니다.')
