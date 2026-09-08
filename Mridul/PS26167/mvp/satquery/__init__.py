"""SatQuery AI -- agentic vision-language analysis of remote-sensing imagery.

Reference implementation for SIH26167 (ISRO). See ../docs/03_Model_Specification.md;
that document is the build contract and states which components exist, which are
targets, and what each one is measured against.

The architectural rule the whole package is arranged around: vision models produce
the facts, the language layer only phrases them. A number in an answer is always
traceable to a model that computed it and an evidence record that validated it.
"""

__version__ = "0.0.1-scaffold"
