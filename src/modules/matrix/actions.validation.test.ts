import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approveVersion: vi.fn(),
  copyToNewDraft: vi.fn(),
  createDraftVersion: vi.fn(),
  deleteCell: vi.fn(),
  getMatrixInputs: vi.fn(),
  getVersionWithCells: vi.fn(),
  insertCell: vi.fn(),
  replaceCell: vi.fn(),
  updateCellText: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/repositories/matrix", () => ({
  approveVersion: mocks.approveVersion,
  copyToNewDraft: mocks.copyToNewDraft,
  createDraftVersion: mocks.createDraftVersion,
  deleteCell: mocks.deleteCell,
  getMatrixInputs: mocks.getMatrixInputs,
  getVersionWithCells: mocks.getVersionWithCells,
  insertCell: mocks.insertCell,
  replaceCell: mocks.replaceCell,
  updateCellText: mocks.updateCellText,
}));

import { addCell, generateMatrix, regenerateCell } from "./actions";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const VERSION_ID = "00000000-0000-4000-8000-000000000002";
const CELL_ID = "00000000-0000-4000-8000-000000000003";
const PERSONA_ID = "00000000-0000-4000-8000-000000000010";
const MARKET_ID = "00000000-0000-4000-8000-000000000011";

function matrixInputs() {
  return {
    project: {
      id: PROJECT_ID,
      status: "active",
      category: "Accounts payable automation",
      categoryArchetype: "b2b",
      jobToBeDone: "Compare payment workflow tools",
    },
    client: {
      name: "LedgerFox",
      aliasesJson: ["Ledger Fox"],
    },
    competitors: [
      { name: "SpendPilot", aliasesJson: [], priority: 0 },
      { name: "Northstar AP", aliasesJson: [], priority: 1 },
      { name: "PayFlow", aliasesJson: [], priority: 2 },
    ] as Array<{ name: string; aliasesJson: string[]; priority: number }>,
    personas: [{ id: PERSONA_ID, title: "Controller" }],
    markets: [{ id: MARKET_ID, name: "United States" }],
    attributes: ["audit trail", "erp sync", "approval routing", "fast setup", "fraud checks", "vendor portal"],
    templates: [
      {
        intent: "discovery",
        archetype: "b2b",
        variantKey: "v1",
        templateText: "Which tools help {persona} in {market}?",
      },
      {
        intent: "discovery",
        archetype: "b2b",
        variantKey: "v2",
        templateText: "What should {persona} know about {category} tools?",
      },
    ],
  };
}

describe("matrix action validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects BC-3 brand alias overlap before creating a matrix draft", async () => {
    const inputs = matrixInputs();
    inputs.competitors[0].aliasesJson = ["Ledger Fox"];
    mocks.getMatrixInputs.mockResolvedValue(inputs);

    const result = await generateMatrix(PROJECT_ID);

    expect(result).toEqual({
      ok: false,
      error: 'BC-3 alias overlap — "ledger fox" is tracked on both LedgerFox and SpendPilot',
    });
    expect(mocks.createDraftVersion).not.toHaveBeenCalled();
  });

  it("returns a controlled error when draft matrix creation fails", async () => {
    mocks.getMatrixInputs.mockResolvedValue(matrixInputs());
    mocks.createDraftVersion.mockRejectedValue(new Error("Another matrix version was created at the same time"));

    await expect(generateMatrix(PROJECT_ID)).resolves.toEqual({
      ok: false,
      error: "Another matrix version was created at the same time",
    });
  });

  it("returns a controlled error when adding a cell fails at persistence", async () => {
    mocks.getMatrixInputs.mockResolvedValue(matrixInputs());
    mocks.getVersionWithCells.mockResolvedValue({ version: { id: VERSION_ID, state: "draft" }, cells: [] });
    mocks.insertCell.mockRejectedValue(new Error("Matrix version is not a draft; approved versions are frozen (C-4)"));

    await expect(addCell(PROJECT_ID, VERSION_ID, "discovery")).resolves.toEqual({
      ok: false,
      error: "Matrix version is not a draft; approved versions are frozen (C-4)",
    });
  });

  it("reports not found when regenerated cell replacement affects no rows", async () => {
    mocks.getMatrixInputs.mockResolvedValue(matrixInputs());
    mocks.getVersionWithCells.mockResolvedValue({
      version: { id: VERSION_ID, state: "draft" },
      cells: [
        {
          id: CELL_ID,
          intent: "discovery",
          personaId: PERSONA_ID,
          marketId: MARKET_ID,
          variantKey: "v1",
          resolvedText: "Original prompt",
          competitorOrderJson: [],
        },
      ],
    });
    mocks.replaceCell.mockResolvedValue(0);

    await expect(regenerateCell(PROJECT_ID, VERSION_ID, CELL_ID)).resolves.toEqual({
      ok: false,
      error: "Cell not found in this version",
    });
  });
});
