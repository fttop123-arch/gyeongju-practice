// 고정 오류 코드·문구와 허용목록 진단만 사용합니다. 원문/stack/cause는 기록하지 않습니다.
export const REGISTRATION_AI_ERRORS=Object.freeze({
 UPSTREAM_AUTH_FAILED:[502,'AI 공급자 인증에 실패했습니다. 관리자에게 서버의 AI API 인증 확인을 요청하세요. 웹사이트 접속코드와는 별개입니다.'],
 UPSTREAM_FORBIDDEN:[502,'AI 모델에 접근할 권한이 없습니다. 관리자에게 해당 모델의 사용 권한 확인을 요청하세요.'],
 UPSTREAM_NOT_FOUND:[502,'AI 모델 또는 호출 경로를 찾지 못했습니다. 관리자에게 모델 연결 확인을 요청하세요.'],
 UPSTREAM_RATE_LIMIT:[429,'AI 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'],
 UPSTREAM_HTTP_ERROR:[502,'AI 공급자 서비스가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'],
 NETWORK_ERROR:[502,'AI 서비스에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.'],
 AI_TIMEOUT:[504,'AI 응답 시간이 초과되었습니다. 기존 입력은 유지됩니다. 잠시 후 다시 시도해 주세요.'],
 AI_EMPTY_RESPONSE:[502,'AI 응답 내용이 없습니다. AI 후보를 다시 생성해 주세요.'],
 UPSTREAM_RESPONSE_INVALID:[502,'AI 공급자의 응답 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.'],
 JSON_PARSE_FAILED:[502,'AI 응답을 JSON으로 읽지 못했습니다. AI 후보를 다시 생성해 주세요.'],
 JSON_REQUIRED_MISSING:[502,'AI 응답에 필수항목이 누락됐습니다. AI 후보를 다시 생성해 주세요.'],
 JSON_SCHEMA_INVALID:[502,'AI 응답 항목의 형식이 올바르지 않습니다. AI 후보를 다시 생성해 주세요.'],
 UNKNOWN_CSV_COLUMN:[502,'AI가 실제 CSV에 없는 컬럼을 근거로 사용했습니다. AI 후보를 다시 생성해 주세요.'],
 BASIS_VALIDATION_FAILED:[502,'AI가 확인되지 않은 보유근거를 생성했습니다. 후보를 적용하지 않았습니다. 다시 생성하거나 실제 근거를 직접 확인해 입력하세요.'],
 EVIDENCE_VALIDATION_FAILED:[502,'AI 후보의 컬럼 근거가 누락되었거나 올바르지 않습니다. AI 후보를 다시 생성해 주세요.'],
 UNEXPECTED_ERROR:[500,'AI 처리 중 예상하지 못한 오류가 발생했습니다. 확인 번호를 관리자에게 알려주세요. 기존 입력은 유지됩니다.'],
});
export class RegistrationAiError extends Error {
 constructor(code,stage,diagnostic={}){const safeCode=Object.hasOwn(REGISTRATION_AI_ERRORS,code)?code:'UNEXPECTED_ERROR';super(REGISTRATION_AI_ERRORS[safeCode][1]);this.name='RegistrationAiError';this.code=safeCode;this.stage=stage;this.providerStatus=diagnostic.providerStatus??null;this.finishReason=diagnostic.finishReason??null;}
}
export function registrationAiDiagnostic(error,requestId){
 const known=error instanceof RegistrationAiError&&Object.hasOwn(REGISTRATION_AI_ERRORS,error.code);
 return {stage:known&&['provider_request','provider_response','candidate_parse','candidate_validation','generate'].includes(error.stage)?error.stage:'generate',code:known?error.code:'UNEXPECTED_ERROR',providerStatus:known&&Number.isInteger(error.providerStatus)&&error.providerStatus>=100&&error.providerStatus<=599?error.providerStatus:null,finishReason:known&&['stop','length','content_filter','tool_calls','function_call','safety'].includes(error.finishReason)?error.finishReason:null,requestId};
}
