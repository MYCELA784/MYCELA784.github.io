/* PUBLIC API (consumed by parsers.js)
 *   MYCELA.SearchEngine.EnvironmentRules  — [{ rx, sealing?, typeHints?, appHint?, note }]
 *   MYCELA.SearchEngine.ApplicationRules  — [[rx, appTag], ...]
 *
 * Edit these tables to add environments or application categories without
 * touching any parser or scoring logic.
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

  ns.SearchEngine.EnvironmentRules = [
    { rx: /marine|offshore|sea\s*water|salt\s*water|naval|boat|ship|ocean|coastal/,
      sealing: 'Sealed', appHint: 'marine',
      note: 'Marine / saltwater: sealed contact-lip bearings needed to resist corrosion. Stainless steel variants (SKF SS6xxx / NTN SS series) are ideal but may not be in this catalog — standard sealed DGBB is the closest available option.' },
    { rx: /acid|corrosiv|chemical\s*resist|aggressive\s*env|harsh\s*chem/,
      sealing: 'Sealed',
      note: 'Corrosive / acidic environment: sealed bearings required. Standard chrome steel corrodes — specify stainless or ceramic hybrid bearings from the manufacturer directly.' },
    { rx: /food|dairy|bakery|beverage|hygien|sanitar|wash.?down|fda|usda/,
      sealing: 'Sealed', appHint: 'food processing',
      note: 'Food industry: sealed bearings required to prevent contamination. NSF H1 food-grade grease is mandatory. Prefer stainless steel or polymer housings for wash-down areas.' },
    { rx: /cover.*oil|oil.*cover|oil\s*splash|oil\s*mist|oily|submerged.*oil|oil\s*bath|oil\s*env/,
      sealing: 'Sealed',
      note: 'Oil-exposed environment: sealed bearings prevent external oil from washing out the bearing grease inside, which would cause premature failure.' },
    { rx: /dust|dirty|outdoor|contamina|sandy|muddy/,
      sealing: 'Sealed',
      note: 'Dusty / contaminated environment: sealed or shielded bearings. Contact-lip sealed (2RS / LLU) preferred for heavy contamination.' },
    { rx: /wet|humid|moisture|splash|water|rain|wash/,
      sealing: 'Sealed',
      note: 'Wet / humid conditions: contact-sealed bearings (2RS) to prevent water ingress and corrosion.' },
    { rx: /high\s*temp|furnace|oven|kiln|steam|[6-9]\d\s*deg|1\d\d\s*deg|[6-9]\d\s*°|1\d\d\s*°|above\s*[6-9]\d|above\s*1\d\d|upto\s*1\d\d|up\s*to\s*1\d\d/,
      typeHints: ['Cylindrical Roller', 'Spherical Roller', 'Deep Groove Ball'],
      note: 'High temperature (60°C+): standard grease degrades above 120°C. Specify bearings with high-temperature grease (e.g. Klüber Isoflex Topas NB 52) or request C3 internal clearance suffix for thermal expansion. For 100°C continuous, standard sealed bearings are borderline — open bearings with external HT grease are more reliable.' },
    { rx: /high\s*speed|fast\s*rotat/,
      typeHints: ['Deep Groove Ball', 'Angular Contact Ball', 'Cylindrical Roller'],
      note: 'High-speed: deep groove ball or angular contact bearings with high rpm ratings preferred.' },
    { rx: /heavy\s*(?:load|duty)|high\s*load|large\s*load|high\s*force/,
      typeHints: ['Spherical Roller', 'Cylindrical Roller', 'Tapered Roller'],
      note: 'Heavy loads: roller bearings (spherical, cylindrical, or tapered) offer higher load capacity than ball bearings.' },
    { rx: /misalign|vibrat|shock\s*load|uneven|oscillat|deflect/,
      typeHints: ['Spherical Roller', 'Self-Aligning Ball'],
      note: 'Misalignment / vibration / shock: spherical roller or self-aligning ball bearings accommodate shaft deflection.' },
    { rx: /combined\s*load|both.*(?:axial|radial)|axial.*radial|radial.*axial/,
      typeHints: ['Angular Contact Ball', 'Tapered Roller'],
      note: 'Combined axial + radial loads: angular contact ball or tapered roller bearings handle both directions.' },
    { rx: /self.?lubricat|maintenance.?free|sealed.?for.?life|no.*re.?grease/,
      sealing: 'Sealed',
      note: 'Self-lubricating / maintenance-free: pre-greased sealed-for-life bearings (2RS / LLU suffix). No re-greasing needed.' },
  ];

  ns.SearchEngine.ApplicationRules = [
    [/pump/,                                        'pumps'],
    [/motor|electric\s*motor/,                      'electric motors'],
    [/gearbox|gear\s*box|transmission/,             'gearboxes'],
    [/mining|quarry|crusher/,                       'mining'],
    [/auto|vehicle|wheel\s*hub|differential|axle/,  'automotive'],
    [/machine\s*tool|spindle|cnc/,                  'machine tools'],
    [/conveyor/,                                    'conveyors'],
    [/steel\s*plant|rolling\s*mill/,                'steel plants'],
    [/paper\s*mill|pulp/,                           'paper mills'],
    [/\bfan\b|blower/,                              'fans'],
    [/compressor/,                                  'compressors'],
    [/turbine/,                                     'turbines'],
    [/agri|farm|tractor/,                           'agriculture'],
    [/textile/,                                     'textile machinery'],
  ];
})(window.MYCELA = window.MYCELA || {});
