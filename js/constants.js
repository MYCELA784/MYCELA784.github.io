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
    'Thrust Ball':             '⊙',
    'CARB Toroidal Roller':    '◍',
  };
  ns.BRAND_COLORS = { SKF: '#0F58A8', NTN: '#1D9E75', FAG: '#993C1D' };

  ns.SUFFIX_CODES = {
    '2Z':'Shielded both sides (steel shields)','Z':'Shielded one side',
    '2RS':'Sealed both sides (rubber contact seals)','2RS1':'Sealed both sides (NBR rubber)',
    '2RS2':'Sealed both sides (FKM high-temp)','2RSR':'Sealed both sides (FAG rubber)',
    '2RSH':'Sealed both sides (SKF high-performance)','2RSL':'Low-friction seals both sides',
    '2RS5':'Sealed both sides (SKF spherical roller)','RS':'Sealed one side (contact seal)',
    '2HRS':'Sealed both sides (HNBR contact seals)',
    '2RZ':'Low-friction non-contact seals','ZZ':'Shielded both sides (steel shields)',
    'LLU':'Contact sealed both sides (NTN)','LLB':'Non-contact sealed (NTN)',
    'LLH':'Low-torque sealed (NTN)','C':'FAG Generation C — optimized design',
    'C3':'Radial clearance greater than Normal','C4':'Radial clearance greater than C3',
    'C2':'Radial clearance smaller than Normal','E':'Reinforced — higher load capacity',
    'E1':'FAG reinforced design','K':'Tapered bore (1:12)','M':'Machined brass cage',
    'MA':'Brass cage, outer ring centred','P4':'ISO precision class 4',
    'P4A':'SKF precision P4A','TN9':'Polyamide cage','TVH':'Polyamide cage (FAG)',
    'HC':'Hybrid ceramic balls','W33':'Lubrication groove and holes',
    'CC':'Optimized roller guidance','X':'ISO boundary dimensions','XL':'FAG X-life premium'
  };
})(window.MYCELA = window.MYCELA || {});
