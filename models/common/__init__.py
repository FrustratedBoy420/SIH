"""Shared pieces for the adaptation scripts.

Separate from `satquery/` on purpose. The classical pipeline has no neural
dependency and must keep running on a machine with no GPU and no `torch`;
everything in here needs both.
"""

__all__ = ["config", "metrics", "vrsbench"]
