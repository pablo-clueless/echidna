# Echidna

## Overview

Echidna is a browser-based 3D studio for composing circuit boards and devices. Pick a part, place or swap it, and watch voltage, current, power and thermal values update with an instant pass / warn / fail verdict for every component.

## Description

Echidna is built for hobbyists, makers and students. It explains itself as you go and never assumes professional EDA knowledge.

- **Six device types:** smartphones, desktop PCs, laptops, drones, IoT / dev boards and wearables, each with presets you can recreate or modify.
- **Swappable components:** every part is checked against its slot for interface, electrical and thermal compatibility before you apply it.
- **Live simulation:** a Rust circuit solver compiled to WebAssembly runs in a Web Worker and re-solves on every change.
- **Clear verdicts:** a rule engine flags overcurrent, overvoltage, thermal and budget problems, and softens its wording when a verdict rests on estimated data.
- **Learn mode:** plain-language explanations for each verdict and guided first projects.
- **Six languages:** English, French, Spanish, Chinese, Japanese and Russian, in light and dark themes.

Echidna is in early development. See [CHANGELOG.md](CHANGELOG.md) for what has changed.

## Licence

The licence has not been chosen yet. Until one is published, all rights are reserved.
