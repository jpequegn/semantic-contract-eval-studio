import {
  analyzeDefinitionChange,
  semanticDefinitionChanges,
} from "../evaluation/change-impact";

const change = semanticDefinitionChanges[0];
if (!change) {
  throw new Error("No semantic definition change fixture is configured.");
}
process.stdout.write(
  `${JSON.stringify(analyzeDefinitionChange(change), null, 2)}\n`,
);
