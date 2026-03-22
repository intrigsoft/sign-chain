---
sidebar_position: 1
---

# Architecture Overview

SignChain is a monorepo containing four main components, managed by Nx.

```
sign-chain/
├── apps/
│   ├── desktop/        Tauri 2 (Rust + React) desktop app
│   ├── api/            NestJS backend server
│   ├── web/            Verification web app (React + Vite)
│   └── docs/           This documentation (Docusaurus)
├── libs/
│   └── shared/         Shared TypeScript types and utilities
└── contracts/          Solidity smart contracts (Hardhat)
```

## Data Flow

![Architecture data flow](/img/diagrams/architecture-flow.svg)

## Communication Protocols

| Path | Protocol | Data |
|---|---|---|
| Desktop -> API | HTTPS POST | Composite hash, previous tx hash, encrypted payload |
| API -> Blockchain | JSON-RPC | Smart contract transaction |
| API -> Database | Prisma/SQL | Anchor record (tx hash, encrypted payload) |
| Phone -> Web App | HTTPS GET | Verification URL from QR |
| Web App -> API | HTTPS GET | Verification query by tx hash |

## Technology Stack

| Component | Technology | Why |
|---|---|---|
| Desktop frontend | React 19, TypeScript | Component model, ecosystem |
| Desktop backend | Rust (Tauri 2) | PDF manipulation, cryptography, security |
| API server | NestJS, TypeScript | Structured backend, validation, modules |
| Database | PostgreSQL (Prisma) | Relational data, migrations |
| Blockchain | Ethereum-compatible (Hardhat for dev) | Smart contracts, public verifiability |
| Verification web | React, Vite | Lightweight, fast loading for mobile |
| Monorepo | Nx 22 | Task orchestration, caching, dependencies |
