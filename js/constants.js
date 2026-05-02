/* PUBLIC API
 *   MYCELA.BC  — brand color map  { NTN: hex, SKF: hex }
 *   MYCELA.TI  — bearing type → Unicode icon glyph
 */
(function (ns) {
  ns.BC = { NTN: '#e8643a', SKF: '#0069b3' };
  ns.TI = {
    'Deep Groove Ball':        '◉',
    'Cylindrical Roller':      '▬',
    'Tapered Roller':          '◤',
    'Spherical Roller':        '◎',
    'Angular Contact Ball':    '◑',
    'Needle Roller':           '◆',
    'Spherical Roller Thrust': '▲',
    'Self-Aligning Ball':      '◔',
    'Insert (Y-Bearing)':      '◈',
  };
})(window.MYCELA = window.MYCELA || {});
