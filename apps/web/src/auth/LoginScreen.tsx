export function LoginScreen() {
  return (
    <div className="login">
      <h1>Deuce</h1>
      <p>골든랩 팀 채팅입니다. 허용된 Google 계정으로 로그인해 주세요.</p>
      {/* fetch가 아닌 전체 페이지 이동이어야 OAuth state 쿠키 왕복이 동작한다 */}
      <a className="login-btn" href="/auth/google">Google로 로그인</a>
    </div>
  )
}
