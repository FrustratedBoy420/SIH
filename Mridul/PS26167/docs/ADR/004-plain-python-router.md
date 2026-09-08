# ADR-004 — Plain Python router, not an agent framework

**Status:** Accepted
**Date:** 2026-09-09

## Context

The problem statement calls the router the novelty of the whole system:

> *"The novelty of SatQuery AI lies in its agentic, query-driven framework. Instead of applying a single generic VLM, the system selects and executes suitable remote-sensing specialist models, validates inputs, combines their outputs, and returns an evidence-grounded response."*

It further requires selection *"from a predefined registry"* and configuration of *"only permitted task parameters"* — that is, a deliberately constrained agent, not an open-ended one.

## Decision

A **plain Python function**, roughly 200 lines: read the structured intent, validate the inputs against the tool registry, return an ordered list of tool names and parameters. No LangGraph, no LangChain, no agent framework.

## Alternatives considered

**LangGraph or a comparable agent framework.** Rejected on three grounds:

1. **The requirement is constraint, not capability.** Frameworks exist to make agents more capable — loops, retries, dynamic tool discovery. The statement asks for the opposite: a fixed registry and permitted parameters only. Adopting a framework means spending effort disabling most of what it provides.
2. **It hides the thing being judged.** The router is the stated novelty. When a judge asks how routing works, "we call LangGraph" is a worse answer than a function you can display on one slide and read aloud.
3. **Debuggability.** A 200-line function under your own control fails in ways you can trace. A framework fails inside someone else's abstraction, at 2 a.m., at a venue.

## Consequences

**+** Explainable in one slide — directly serves the requirement that is scored.
**+** Zero additional dependency, no version drift.
**+** Failures are traceable to a line you wrote.

**−** Retries, backoff and any future state machinery must be written by hand.
**−** If sequencing grows genuinely complex, this becomes a small framework of your own, badly.

## Revisit if

Tool sequencing routinely exceeds about three chained calls, or the router needs persistent state across turns. Neither is in the current scope.
