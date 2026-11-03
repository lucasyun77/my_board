/* 현황판 오리지널 캐릭터 '서하 실장' — 40대 비서실장. 패션 일러스트 풍(길게 뻗은 비례, 가는 선, 금색 포인트).
   낙타색 롱 트렌치코트, 남색 실크 스카프, 낮게 묶은 흑갈색 머리, 붉은 입술, 금 귀걸이. 모든 그림은 인라인 SVG로 직접 그림. */
(function () {
  'use strict';
  const C = { hair: '#2A1A14', hairHi: '#5A3A2A', skin: '#F2D3BE', skinDk: '#DDB49A', coat: '#B8895A', coatDk: '#8F6440', coatLt: '#CFA477',
    scarf: '#1F2A4D', gold: '#C9A24A', lip: '#A3222C', leg: '#3A2A24', shoe: '#1C1210', eye: '#2A1A14', folder: '#3D1E0F' };

  function hands(pose) {
    const arm = (d, w = 11) => `<path d="${d}" stroke="${C.coat}" stroke-width="${w}" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${C.coatDk}" stroke-width="${w}" stroke-linecap="round" fill="none" opacity=".22"/>`;
    const hand = (x, y, r = 4.6) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r + 1.2}" fill="${C.skin}"/>`;
    const pocketArm = arm('M49 100 Q40 140 47 172') + `<path d="M42 170 q6 4 12 0" stroke="${C.coatDk}" stroke-width="2" fill="none"/>`;
    switch (pose) {
      case 'folder':
        return pocketArm + arm('M91 100 Q104 130 86 146') +
          `<g transform="rotate(-8 84 150)"><rect x="70" y="134" width="30" height="38" rx="2" fill="${C.folder}"/><rect x="73" y="137" width="24" height="32" rx="1" fill="#FFFDF9" opacity=".9"/><path d="M76 145h18M76 151h18M76 157h12" stroke="#B9A08A" stroke-width="1.2"/><rect x="70" y="134" width="30" height="5" fill="${C.gold}" opacity=".85"/></g>` + hand(84, 147);
      case 'key':
        return pocketArm + arm('M91 100 Q108 86 106 62') + hand(106, 58) +
          `<g transform="translate(106 40) rotate(18)"><circle r="8" fill="none" stroke="${C.gold}" stroke-width="3"/><path d="M0 8 v20 M0 20 h6 M0 26 h5" stroke="${C.gold}" stroke-width="3" stroke-linecap="round"/></g><circle cx="106" cy="40" r="16" fill="${C.gold}" opacity=".12"/>`;
      case 'watch':
        return pocketArm + arm('M91 100 Q100 124 88 136') + hand(86, 137) +
          `<rect x="84" y="128" width="9" height="6" rx="1.5" fill="${C.gold}"/><circle cx="88.5" cy="131" r="2" fill="#FFFDF9"/>`;
      default:
        return pocketArm + arm('M91 100 Q100 140 94 172') + `<path d="M88 170 q6 4 12 0" stroke="${C.coatDk}" stroke-width="2" fill="none"/>`;
    }
  }

  function head() {
    return `
      <path d="M64 66 L64 86 Q70 90 77 86 L76 64Z" fill="${C.skinDk}"/>
      <path d="M64 70 L64 86 Q70 89 76 86 L76 72 Q70 76 64 70Z" fill="${C.skin}"/>
      <circle cx="88" cy="56" r="10" fill="${C.hair}"/><path d="M82 50 q6 -2 11 3" stroke="${C.hairHi}" stroke-width="1.6" fill="none" opacity=".6"/>
      <path d="M55 46 Q55 29 70 28 Q85 29 85 46 Q85 62 74 70 Q66 72 60 64 Q55 56 55 46Z" fill="${C.skin}"/>
      <path d="M60 64 Q66 72 74 70 Q68 70 62 62Z" fill="${C.skinDk}" opacity=".6"/>
      <path d="M52 50 Q48 20 72 19 Q94 20 90 50 Q88 38 80 33 Q74 40 60 38 Q55 42 55 54Z" fill="${C.hair}"/>
      <path d="M60 38 Q68 33 80 33 Q72 30 62 32Z" fill="${C.hairHi}" opacity=".5"/>
      <path d="M55 40 Q50 52 56 62 Q56 52 58 44Z" fill="${C.hair}"/>
      <path d="M59 44 q5 -3 10 -1" stroke="${C.hair}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <path d="M73 43 q5 -2 9 1" stroke="${C.hair}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <path d="M60 50 q4.5 -2.6 9 0" stroke="${C.eye}" stroke-width="2.1" fill="none" stroke-linecap="round"/>
      <path d="M73.5 50 q4.5 -2.6 9 0" stroke="${C.eye}" stroke-width="2.1" fill="none" stroke-linecap="round"/>
      <ellipse cx="64.6" cy="51.2" rx="2.3" ry="1.9" fill="${C.eye}"/><ellipse cx="78" cy="51.2" rx="2.3" ry="1.9" fill="${C.eye}"/>
      <circle cx="65.3" cy="50.7" r=".6" fill="#fff"/><circle cx="78.7" cy="50.7" r=".6" fill="#fff"/>
      <path d="M59.5 49.5 l-2 -1.4 M82.5 49.5 l2 -1.6" stroke="${C.eye}" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M71 51 Q70 57 72.5 58.5" stroke="${C.skinDk}" stroke-width="1.2" fill="none"/>
      <path d="M66.5 63 q2.8 -1.6 5.5 -.4 q2.6 -1.2 5 .4 q-2.6 3 -5.3 2.8 q-3 .2 -5.2 -2.8Z" fill="${C.lip}"/>
      <path d="M67.5 63.2 q4.5 1 9 0" stroke="#7A1820" stroke-width=".7" fill="none"/>
      <ellipse cx="62" cy="57" rx="3.6" ry="2" fill="#E89A8E" opacity=".35"/><ellipse cx="81" cy="57" rx="3.2" ry="1.8" fill="#E89A8E" opacity=".3"/>
      <circle cx="85" cy="56" r="1.4" fill="${C.gold}"/><path d="M85 57.5 v3" stroke="${C.gold}" stroke-width="1"/><circle cx="85" cy="62" r="2" fill="${C.gold}"/>`;
  }

  /* size = 세로 높이(px) */
  function mascot(pose = 'stand', size = 200, label = '서하 실장') {
    const w = Math.round(size * 140 / 300);
    return `<svg class="mascot" width="${w}" height="${size}" viewBox="0 0 140 300" role="img" aria-label="${label}">
      <ellipse cx="70" cy="293" rx="34" ry="4" fill="#1C1210" opacity=".14"/>
      <path d="M60 232 L58 284" stroke="${C.leg}" stroke-width="5.5" stroke-linecap="round"/><path d="M78 232 L82 283" stroke="${C.leg}" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M51 288 Q56 283 61 284 L62 289 Z" fill="${C.shoe}"/><path d="M60 284 L61 291" stroke="${C.shoe}" stroke-width="1.6"/>
      <path d="M80 283 Q86 282 91 287 L81 289 Z" fill="${C.shoe}"/><path d="M81 283 L80 291" stroke="${C.shoe}" stroke-width="1.6"/>
      <path d="M47 94 Q70 86 93 94 L106 238 Q72 248 36 238 Z" fill="${C.coat}"/>
      <path d="M47 94 Q44 160 36 238 Q48 242 56 242 Q52 170 56 100Z" fill="${C.coatDk}" opacity=".18"/>
      <path d="M86 96 Q94 170 106 238" stroke="${C.coatLt}" stroke-width="3" fill="none" opacity=".5"/>
      <path d="M57 92 L70 132 L83 92 L77 92 L70 112 L63 92Z" fill="${C.coatDk}"/>
      <path d="M71 156 L76 240" stroke="${C.coatDk}" stroke-width="1.8" opacity=".7"/>
      <path d="M57 122 v14 M83 122 v14" stroke="${C.coatDk}" stroke-width="1.4" opacity=".5"/>
      <rect x="43" y="148" width="56" height="8" rx="2" fill="${C.coatDk}"/><rect x="66" y="146" width="11" height="12" rx="2" fill="none" stroke="${C.gold}" stroke-width="2"/>
      <path d="M77 156 Q80 176 76 190" stroke="${C.coatDk}" stroke-width="4" stroke-linecap="round" fill="none"/>
      ${hands(pose)}
      <path d="M59 88 Q70 98 82 88 L84 96 Q70 106 57 96Z" fill="${C.scarf}"/>
      <path d="M61 92 l3 2 M67 96 l3 1 M74 95 l3 -1" stroke="${C.gold}" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M72 99 L66 126 L74 124 L78 100Z" fill="${C.scarf}"/><path d="M68 112 l6 -1 M67 119 l6 -1" stroke="${C.gold}" stroke-width="1.2"/>
      ${head()}
    </svg>`;
  }

  function face(size = 44) {
    return `<svg width="${size}" height="${size}" viewBox="44 16 52 52" aria-hidden="true">${head()}</svg>`;
  }

  /* V12: 회장님이 주신 프로필 이미지로 교체. 기존 SVG 캐릭터는 쓰지 않음(함수 이름은 호환용으로 유지). */
  const ASSETS = window.ASSETS || (window.ASSETS = { profile: 'assets/profile.webp', heroBg: 'assets/hero-bg.webp' });
  const avatar = (size, label = '서하 실장') => `<img class="avatar-img" src="${ASSETS.profile}" alt="${label}" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`;
  window.ART = { mascot: (pose, size = 64) => avatar(Math.min(88, Math.round(size * 0.62))), face: (size = 44) => avatar(size), avatar };
})();
