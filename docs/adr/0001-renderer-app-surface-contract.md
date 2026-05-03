# Renderer surface 계약은 미래 전환에 tolerance를 둔다

Renderer 작성자 surface는 runtime backend 전환(same-realm → iframe → worker 등)과 사용자 임의 npm 패키지 도입 두 미래에 대해 breakless interface tolerance를 유지한다.
