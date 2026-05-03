# Web UI navigation은 단일 view discriminated union으로 한다

Web UI의 화면 결정 상태는 page, active project, open session, mode를 여러 context에 흩어 두지 않고 단일 `View` discriminated union reducer에 둔다.
모든 navigation transition을 한 번의 dispatch로 처리하고 session memory만 project별로 보존하되 URL을 SSoT로 올리지는 않아, 데스크톱 스타일 앱에서 약한 딥링크 효용보다 cross-domain state drift 방지를 우선한다.
