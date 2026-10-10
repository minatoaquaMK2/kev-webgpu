# Limits and safe interpretation

- This is a synthetic, bounded RCA assistance demo for DPC VMware + PowerStore iSCSI + VMFS. It is not a general diagnostic chatbot, official Dell API parser, support tool or automatic operator
- The only permitted model is Kev-0.8B text q8. A load or compatibility failure stays a failure; there is no larger-model, other-precision, remote-model or whole-model CPU fallback
- Actual GPU execution, real-model semantic correctness, numerical parity, production Pages origin, offline inference, network privacy and memory behavior are unverified until measured on suitable hardware. The implementation container could not start Chromium and had no `/dev/dri`
- The model's option probability describes its finite candidate distribution. It is not a calibrated probability of the real-world diagnosis. Upstream confidence is a separate upstream field, not a top-1 probability relabeled by the app
- Rules independently cross-check all candidates. They do not describe the model's private reasoning, establish causality or overwrite a model choice. A high probability never removes missing/conflicting-evidence flags or authorizes an action
- A failed jumbo probe alone does not identify a switch. Path, source/target, sampling time and configuration matter. An established iSCSI session does not prove effective host/group-to-volume mapping
- Active write protection is a candidate immediate cause of failed writes. It does not prove why physical capacity filled; snapshots are not assumed to be responsible
- Cleared historical alerts are not current faults. Missing collection and empty arrays are not equivalent to a healthy system. Logical, physical, appliance and VMFS capacity measures are not interchangeable
- Model instructions ask the runtime to treat log text as data; that is not a security proof. Injection and evidence-order sensitivity must be measured and failures shown
- No probe, shell command, API request, storage change, rescan, workflow restart or SR creation is executed. Suggested verification is reviewed, allowlisted text for an authorized person
- The public demo only ships synthetic observations. Local inference does not override an organization's data-handling approvals. The static model server sees routine download metadata even when evidence stays local
- Download size is not runtime memory. GPU memory may be released later by the browser/driver; unload cannot promise immediate zero VRAM. No performance, energy or device-memory claim is inferred from INT8 weights
- Offline inference in an already-loaded tab and offline reopening are different capabilities. Only the former is a P0 requirement, and it still needs a recorded real-device test
- No production calibration, real-incident accuracy, broad protocol coverage, full Dell product knowledge or operational safety guarantee is claimed
