/* 현황판 오리지널 캐릭터 '벌이 차장'과 인사말 배경(손그림 풍 언덕·구름·하늘로 오르는 기차).
   벌툰 노랑 코트 + 차장 모자 + 주황 목도리, 갈색 단발. 모든 그림은 인라인 SVG로 직접 그림. */
(function () {
  'use strict';
  const C = { hair: '#6B3E26', hairHi: '#8A5636', skin: '#FFE3C8', cap: '#2B3A67', capDk: '#1F2A4D', coat: '#F2B21B', coatDk: '#C98E0A', scarf: '#E4572E', boot: '#3D1E0F', leg: '#5A3A26', blush: '#F59AA0', eye: '#3D1E0F' };

  function arms(pose) {
    const arm = (d) => `<path d="${d}" stroke="${C.coat}" stroke-width="11" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${C.coatDk}" stroke-width="11" stroke-linecap="round" fill="none" opacity=".18"/>`;
    const hand = (x, y) => `<circle cx="${x}" cy="${y}" r="6.2" fill="${C.skin}"/>`;
    const right = arm('M104 118 Q116 138 112 152') + hand(112, 155);
    switch (pose) {
      case 'wave':
        return arm('M56 118 Q38 106 34 86') + hand(34, 81) + right +
          `<path d="M22 70 q4 -6 8 -2 M18 82 q-6 0 -4 -6" stroke="${C.coatDk}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>`;
      case 'book':
        return arm('M56 118 Q52 136 66 142') + arm('M104 118 Q108 136 94 142') +
          `<g transform="rotate(-6 80 140)"><rect x="60" y="126" width="40" height="28" rx="3" fill="#5B6FB8"/><rect x="62" y="128" width="17" height="24" rx="1.5" fill="#FFFDF9"/><rect x="81" y="128" width="17" height="24" rx="1.5" fill="#FFFDF9"/><path d="M65 134h11M65 139h11M65 144h8M84 134h11M84 139h11M84 144h8" stroke="#C4AB93" stroke-width="1.4"/></g>` +
          hand(66, 143) + hand(94, 143);
      case 'star':
        return arm('M56 118 Q38 104 36 84') + hand(36, 79) + right +
          `<g class="twinkle"><circle cx="34" cy="62" r="16" fill="#FABF1A" opacity=".25"/><path d="M34 48 l4.3 9 9.7 1.2 -7.1 6.7 1.9 9.6 -8.8 -4.8 -8.8 4.8 1.9 -9.6 -7.1 -6.7 9.7 -1.2z" fill="#FABF1A" stroke="#E9A400" stroke-width="1.2"/></g>`;
      case 'lantern':
        return arm('M56 118 Q46 138 50 152') + hand(50, 155) + arm('M104 118 Q118 128 120 142') + hand(120, 145) +
          `<path d="M120 150 v6" stroke="${C.boot}" stroke-width="2"/><circle cx="120" cy="170" r="16" fill="#FABF1A" opacity=".22"/><rect x="111" y="156" width="18" height="24" rx="5" fill="#FFE493" stroke="${C.boot}" stroke-width="2"/><rect x="113" y="154" width="14" height="4" rx="2" fill="${C.boot}"/><circle cx="120" cy="168" r="4" fill="#F27B1A"/>`;
      default:
        return arm('M56 118 Q44 138 48 152') + hand(48, 155) + right;
    }
  }

  function mascot(pose = 'idle', size = 120, label = '벌이 차장') {
    return `<svg class="mascot" width="${size}" height="${Math.round(size * 1.25)}" viewBox="0 0 160 200" role="img" aria-label="${label}">
      <ellipse cx="80" cy="193" rx="38" ry="5" fill="#3D1E0F" opacity=".12"/>
      <rect x="64" y="166" width="11" height="20" rx="4" fill="${C.leg}"/><rect x="86" y="166" width="11" height="20" rx="4" fill="${C.leg}"/>
      <ellipse cx="68" cy="188" rx="10" ry="5.5" fill="${C.boot}"/><ellipse cx="93" cy="188" rx="10" ry="5.5" fill="${C.boot}"/>
      <path d="M57 112 Q80 105 103 112 L116 168 Q80 177 44 168 Z" fill="${C.coat}"/>
      <path d="M80 114 V172" stroke="${C.coatDk}" stroke-width="2" opacity=".5"/>
      <path d="M57 112 Q52 140 44 168 Q60 172 66 172 Q60 140 64 114Z" fill="${C.coatDk}" opacity=".15"/>
      <circle cx="80" cy="130" r="2.6" fill="${C.leg}"/><circle cx="80" cy="143" r="2.6" fill="${C.leg}"/><circle cx="80" cy="156" r="2.6" fill="${C.leg}"/>
      <path d="M60 150 h12" stroke="${C.coatDk}" stroke-width="2" stroke-linecap="round" opacity=".5"/>
      ${arms(pose)}
      <path d="M58 107 Q80 117 102 107 L104 116 Q80 127 56 116 Z" fill="${C.scarf}"/>
      <path d="M92 116 Q103 131 117 129 Q108 122 101 113 Z" fill="${C.scarf}"/><path d="M95 120 Q104 128 112 128" stroke="#B8401E" stroke-width="1.2" fill="none" opacity=".6"/>
      <ellipse cx="80" cy="74" rx="38" ry="37" fill="${C.hair}"/>
      <path d="M46 74 Q42 100 54 113 Q57 96 55 80Z" fill="${C.hair}"/><path d="M114 74 Q118 100 106 113 Q103 96 105 80Z" fill="${C.hair}"/>
      <ellipse cx="80" cy="82" rx="29" ry="29" fill="${C.skin}"/>
      <path d="M51 74 Q58 56 80 57 Q102 56 109 74 Q98 66 90 70 Q84 61 76 70 Q66 63 51 74Z" fill="${C.hair}"/>
      <path d="M62 62 Q70 58 78 60" stroke="${C.hairHi}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/>
      <ellipse cx="69" cy="85" rx="4.2" ry="5.8" fill="${C.eye}"/><ellipse cx="91" cy="85" rx="4.2" ry="5.8" fill="${C.eye}"/>
      <circle cx="70.6" cy="82.6" r="1.7" fill="#fff"/><circle cx="92.6" cy="82.6" r="1.7" fill="#fff"/>
      <path d="M64 76 q5 -3 9 0 M87 76 q5 -3 9 0" stroke="${C.hair}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <ellipse cx="62" cy="94" rx="5.5" ry="3.2" fill="${C.blush}" opacity=".55"/><ellipse cx="98" cy="94" rx="5.5" ry="3.2" fill="${C.blush}" opacity=".55"/>
      <path d="M75 97 Q80 101.5 85 97" stroke="#A0522D" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M46 55 Q48 28 80 26 Q112 28 114 55 Z" fill="${C.cap}"/>
      <path d="M58 34 Q70 29 84 30" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".18"/>
      <rect x="45" y="50" width="70" height="9" rx="3.5" fill="${C.capDk}"/>
      <path d="M48 58 Q80 70 112 58 Q80 63 48 58Z" fill="${C.capDk}"/>
      <circle cx="80" cy="42" r="7.5" fill="#FABF1A"/><path d="M80 36.5 l1.7 3.6 3.9 .5 -2.9 2.7 .8 3.9 -3.5 -2 -3.5 2 .8 -3.9 -2.9 -2.7 3.9 -.5z" fill="${C.capDk}"/>
    </svg>`;
  }

  function face(size = 40) {
    return `<svg width="${size}" height="${size}" viewBox="40 22 80 80" aria-hidden="true">
      <ellipse cx="80" cy="74" rx="38" ry="37" fill="${C.hair}"/><ellipse cx="80" cy="82" rx="29" ry="29" fill="${C.skin}"/>
      <path d="M51 74 Q58 56 80 57 Q102 56 109 74 Q98 66 90 70 Q84 61 76 70 Q66 63 51 74Z" fill="${C.hair}"/>
      <ellipse cx="69" cy="85" rx="4.2" ry="5.8" fill="${C.eye}"/><ellipse cx="91" cy="85" rx="4.2" ry="5.8" fill="${C.eye}"/>
      <circle cx="70.6" cy="82.6" r="1.7" fill="#fff"/><circle cx="92.6" cy="82.6" r="1.7" fill="#fff"/>
      <ellipse cx="62" cy="94" rx="5.5" ry="3.2" fill="${C.blush}" opacity=".55"/><ellipse cx="98" cy="94" rx="5.5" ry="3.2" fill="${C.blush}" opacity=".55"/>
      <path d="M75 97 Q80 101.5 85 97" stroke="#A0522D" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M46 55 Q48 28 80 26 Q112 28 114 55 Z" fill="${C.cap}"/><rect x="45" y="50" width="70" height="9" rx="3.5" fill="${C.capDk}"/>
      <circle cx="80" cy="42" r="7.5" fill="#FABF1A"/></svg>`;
  }

  /* 인사말 배경: 구름·두 겹 언덕·하늘로 이어지는 별빛 선로와 작은 기차. 밤(다크)에는 별이 뜬다. */
  function scene() {
    const stars = [[90, 40], [210, 22], [330, 58], [460, 28], [560, 64], [640, 18], [760, 48], [880, 24], [950, 70], [150, 90], [400, 96], [700, 88]]
      .map(([x, y], i) => `<circle class="star" cx="${x}" cy="${y}" r="${i % 3 ? 1.4 : 2.2}"/>`).join('');
    const cloud = (x, y, s) => `<g class="cloud" transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="10" rx="46" ry="16"/><circle cx="-18" cy="2" r="18"/><circle cx="8" cy="-6" r="24"/><circle cx="30" cy="4" r="16"/></g>`;
    const bz = (t) => [(1 - t) ** 2 * 470 + 2 * t * (1 - t) * 730 + t * t * 1000, (1 - t) ** 2 * 190 + 2 * t * (1 - t) * 135 + t * t * 40];
    const sleepers = Array.from({ length: 18 }, (_, i) => { const [x, y] = bz(i / 17); return `<path d="M${(x - 3).toFixed(1)} ${(y + 6).toFixed(1)} l6 -12" />`; }).join('');
    return `<svg class="scene" viewBox="0 0 1000 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      ${stars}
      ${cloud(120, 54, 1)}${cloud(400, 40, .8)}${cloud(860, 44, 1.1)}
      <path class="hill1" d="M0 168 Q140 120 290 158 T600 146 T1000 136 V220 H0Z"/>
      <path class="track" d="M470 190 Q730 135 1000 40" fill="none"/>
      <g class="sleepers">${sleepers}</g>
      <g class="train" transform="translate(676 136) rotate(-15)">
        <circle class="puff" cx="58" cy="-16" r="6"/><circle class="puff" cx="70" cy="-26" r="8"/><circle class="puff" cx="86" cy="-32" r="10"/>
        <rect x="-62" y="-14" width="34" height="16" rx="3" class="car"/><rect x="-24" y="-14" width="34" height="16" rx="3" class="car"/>
        <rect x="14" y="-18" width="38" height="20" rx="4" class="loco"/><rect x="40" y="-28" width="8" height="12" rx="2" class="loco"/>
        <rect x="-56" y="-10" width="7" height="6" rx="1.5" class="win"/><rect x="-44" y="-10" width="7" height="6" rx="1.5" class="win"/><rect x="-18" y="-10" width="7" height="6" rx="1.5" class="win"/><rect x="-6" y="-10" width="7" height="6" rx="1.5" class="win"/><rect x="20" y="-14" width="9" height="7" rx="1.5" class="win"/>
        <circle cx="-54" cy="3" r="3" class="wheel"/><circle cx="-36" cy="3" r="3" class="wheel"/><circle cx="-16" cy="3" r="3" class="wheel"/><circle cx="2" cy="3" r="3" class="wheel"/><circle cx="22" cy="4" r="3.5" class="wheel"/><circle cx="42" cy="4" r="3.5" class="wheel"/>
      </g>
      <path class="hill2" d="M0 196 Q220 158 440 190 T1000 178 V220 H0Z"/>
      <g class="flowers"><circle cx="90" cy="196" r="2.4"/><circle cx="130" cy="188" r="2"/><circle cx="240" cy="182" r="2.4"/><circle cx="330" cy="190" r="2"/><circle cx="520" cy="196" r="2.2"/></g>
    </svg>`;
  }

  window.ART = { mascot, face, scene };
})();
