import { addChemical, forgetMemory, setGuided } from '../project/store';
import { defaultGuided } from '../guided/state';
import { defineKeyboardOrder, GUIDED_ROUTES } from './screenKeyboard.testkit';

/** Two chemicals, groundwater and soil gas sources with values, the well and building paths: every control of steps 2 to 3d shows. */
function fillProject(): void {
  forgetMemory();
  addChemical({ id: '71-43-2', name: 'Benzene' });
  addChemical({ id: '1634-04-4', name: 'Methyl tert-butyl ether' });
  const g = defaultGuided();
  g.site = {
    ...g.site,
    sources: ['groundwater', 'soilGas'],
    location: 'downgradient',
    paths: { ...g.site.paths, well: true, building: true },
  };
  for (const id of ['71-43-2', '1634-04-4']) {
    g.sources[id] = {
      values: {
        groundwater: { value: '1', unit: 'mg/L' },
        soilGas: { value: '50', unit: 'ug/m3' },
      },
      note: '',
      tph: '',
    };
  }
  setGuided(g);
}

defineKeyboardOrder(GUIDED_ROUTES);
defineKeyboardOrder(GUIDED_ROUTES, fillProject);
