import { ChemicalsWorkspace } from '../../chemicals/ChemicalsPage';
import { MAX_PROJECT_CHEMICALS } from '../../chemicals/browse';

/**
 * Step 1, chemicals of concern: the project's chemicals on one side, the EPA chemical database on the
 * other (search by name or CAS number, the exact name first), at most 50 chemicals.
 */
export function ChemicalsStep() {
  return (
    <section aria-labelledby="step-chemicals-heading" className="vadose chemicals chem-step">
      <h1 id="step-chemicals-heading">Chemicals of concern</h1>
      <p className="muted">
        Choose the chemicals this assessment covers, up to {MAX_PROJECT_CHEMICALS}. Every later step
        works on this list.
      </p>
      <ChemicalsWorkspace
        projectIntro="The chemicals in this project. Remove one to drop it from every step, or define a chemical of your own."
        browserHeading="Chemical database"
        browserIntro={
          <p className="muted">
            EPA Regional Screening Level data. Search by name or CAS number, open a chemical to see
            each value with its source, and download the table.
          </p>
        }
      />
    </section>
  );
}
