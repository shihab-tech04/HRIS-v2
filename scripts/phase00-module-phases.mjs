// Operational primary-phase grouping for the recovered master inventory.
// This does not modify the immutable source phase:null fields, invent feature rules,
// or imply that a module is implemented/accepted. Cross-phase tests remain required.
export const modulePrimaryPhases = Object.freeze({
  '03': 'SA01 SA12'.split(' '),
  '04': 'SA02 SA03 SA04 SA05 SA10 SA11'.split(' '),
  '05': 'E02 E03 E04 E37 HR01 HR03 SA06'.split(' '),
  '06': `E39 E40 M15 H02 H03 HR10 HR11 HR12 HR13 HR14 HR15 HR16
    CA01 CA02 CA03 CA04 CA05 CA06 CA07 CA08 CA09 CA10 CA11 CA12 CA13 CA14 CA15 CA16 CA17 CA18 CA19 X01 X02`.split(/\s+/),
  '07': 'HR02 HR17 HR18 CA20 CA21 X03'.split(' '),
  '08': 'E05 E06 E10 E11 E12 E13 E14 E15 M02 M04 M05 M06 M07 M14 HR05 HR06'.split(' '),
  '09': 'E07 E08 E09 M03 HR07 HR08 HR09 X04'.split(' '),
  '10': 'E38 M08'.split(' '),
  '11': 'E16 E17 E18 E19 M09 M10 M11 M12 M16 H04 H05 H06 HR20 HR21 X06'.split(' '),
  '12': 'E20 E21 E41 M13 H07 HR22'.split(' '),
  '13': 'E22 E23 E24 E25 E26 E29 E30 HR23 HR24 HR25 HR26 X05'.split(' '),
  '14': 'E27 E28'.split(' '),
  '15': `E31 E32 E33 E34 E42 E43 E44 E45 M17 HR04 HR19 HR27 HR28 HR29 HR30 HR31 HR32
    A01 A02 A03 A04 A05 X07`.split(/\s+/),
  '16': 'E35 E36 E46 SA07 SA08 C03'.split(' '),
  '17': 'E01 M01 H01 H08 HR33 C01 C02 C04'.split(' '),
  '19': 'SA09'.split(' '),
});

export function indexModulePrimaryPhases(modules) {
  const indexed = new Map();
  for (const [phase, ids] of Object.entries(modulePrimaryPhases)) {
    for (const id of ids) {
      if (indexed.has(id)) throw new Error(`Module assigned twice: ${id}`);
      indexed.set(id, phase);
    }
  }
  const actual = new Set(modules.map(module => module.id));
  if (actual.size !== modules.length) throw new Error('Duplicate module IDs in canonical source.');
  for (const id of actual) if (!indexed.has(id)) throw new Error(`No primary operational phase for ${id}`);
  for (const id of indexed.keys()) if (!actual.has(id)) throw new Error(`Unknown module in operational phase plan: ${id}`);
  return indexed;
}
