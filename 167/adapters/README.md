# adapters/

Adapter packs the model runtime serves. Each pack is a directory with a
`pack.json` manifest plus standard PEFT artefacts (`satquery/runtime.py`, TRD §4.6):

    adapters/adapter_A_rs_general/
        pack.json                    {"pack_id", "component", "adapter", "base_model", ...}
        adapter_config.json
        adapter_model.safetensors

Everything here except this file is gitignored — packs hold weights, and
`models/MANIFEST.md` records where each one came from and what it scored.
With no pack, every capability is served by the classical path and each
result says so in `engine` and in its trace.
