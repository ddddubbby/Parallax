# Golden Expectation Manifest

M5 requires approximately 25 hand-labeled golden examples.

Each golden case should include:

- source fixture id
- expected `ExtractedResponse` JSON
- expected brand mention rows
- expected claim verdict rows
- expected metric outputs for at least one scope

Golden tests must fail if a fixture changes without the expected extraction and metric outputs changing in the same commit.
