import { describe, expect, it } from "vitest";
import {
  compileContracts,
  contractFingerprint,
  semanticContracts,
  visibleContracts,
} from "../../src/domain/contracts";

describe("semantic contracts", () => {
  it("keeps finance contracts visible to finance and executive roles only", () => {
    const financeContracts = visibleContracts(semanticContracts, "finance");
    const supportContracts = visibleContracts(semanticContracts, "support");

    expect(financeContracts.map((contract) => contract.id)).toContain(
      "finance.active_customer",
    );
    expect(supportContracts.map((contract) => contract.id)).not.toContain(
      "finance.active_customer",
    );
  });

  it("captures the deliberate conflict between customer definitions", () => {
    const financeCustomer = semanticContracts.find(
      (contract) => contract.id === "finance.active_customer",
    );

    expect(financeCustomer?.conflictsWith).toEqual([
      "product.active_workspace",
    ]);
    expect(contractFingerprint).toHaveLength(64);
  });

  it("rejects duplicate ids and unknown conflicts", () => {
    const duplicate = [semanticContracts[0], semanticContracts[0]];
    const unknownConflict = [
      {
        ...semanticContracts[0],
        conflictsWith: ["missing.contract"],
        id: "finance.test_metric",
      },
    ];

    expect(() => compileContracts(duplicate)).toThrow(
      "Duplicate semantic contract id",
    );
    expect(() => compileContracts(unknownConflict)).toThrow("unknown conflict");
  });
});
