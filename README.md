# Investidor Inteligente

Aplicação fullstack para gerenciamento de carteira de investimentos, com foco em ativos brasileiros (ações, FIIs, renda fixa, tesouro e criptomoedas).

## Tecnologias

**Backend**
- [Fastify](https://fastify.dev/) 4 — framework HTTP
- [Prisma](https://www.prisma.io/) 5 — ORM
- [PostgreSQL](https://www.postgresql.org/) — banco de dados
- [Zod](https://zod.dev/) — validação de dados
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) — hash de senhas
- TypeScript + ts-node-dev

**Frontend**
- [Next.js](https://nextjs.org/) 14 (App Router)
- [React](https://react.dev/) 18
- [NextAuth.js](https://next-auth.js.org/) 4 — autenticação
- [Recharts](https://recharts.org/) — gráficos financeiros
- [Tailwind CSS](https://tailwindcss.com/) — estilização
- [Axios](https://axios-http.com/) — cliente HTTP
- [Lucide React](https://lucide.dev/) — ícones

---

## Funcionalidades

- Cadastro e login de usuários
- Múltiplas carteiras por usuário
- Registro de transações (compra e venda)
- Controle de proventos (dividendos, JCP, rendimentos, amortizações, subscrições)
- Dashboard com KPIs da carteira
- Gráfico de evolução patrimonial (12 meses)
- Gráfico de composição por classe de ativo
- Tabela de posições consolidadas
- Busca de cotações por ticker

---

## Estrutura do Projeto

```
investidor-inteligente/
├── package.json              # Scripts raiz (monorepo)
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma     # Modelos do banco de dados
│   │   └── migrations/       # Migrações SQL
│   ├── src/
│   │   ├── index.ts          # Entrada do servidor Fastify
│   │   ├── lib/
│   │   │   └── prisma.ts     # Instância do Prisma Client
│   │   ├── routes/
│   │   │   ├── wallets.ts    # Auth + carteiras
│   │   │   ├── assets.ts     # Ativos
│   │   │   ├── transactions.ts
│   │   │   ├── dividends.ts
│   │   │   ├── dashboard.ts
│   │   │   └── quotes.ts     # Cotações
│   │   └── services/
│   │       ├── portfolio.ts  # Cálculos de posição
│   │       └── quotes.ts     # Integração de cotações
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── providers.tsx
    │   ├── login/
    │   ├── dashboard/
    │   ├── transactions/
    │   └── dividends/
    ├── components/
    │   ├── charts/           # CompositionChart, EvolutionChart
    │   ├── dashboard/        # AssetTable, KPICard
    │   ├── layout/           # AppLayout, Sidebar
    │   └── ui/               # Card, Modal, Badge, TickerInput, AssetLogo
    ├── lib/
    │   ├── api.ts            # Cliente Axios
    │   ├── formatters.ts     # Formatação de números e datas
    │   └── store.ts          # Estado do cliente
    ├── .env.local.example
    └── package.json
```

---

## Modelos de Dados

| Modelo | Descrição |
|--------|-----------|
| `User` | Usuários da aplicação |
| `Wallet` | Carteiras de investimento por usuário |
| `Asset` | Ativos dentro de uma carteira |
| `Transaction` | Operações de compra e venda |
| `Dividend` | Proventos recebidos |

**Classes de ativo:** `FII`, `STOCK`, `FIXED_INCOME`, `TREASURY`, `CRYPTO`

**Tipos de provento:** `DIVIDEND`, `JCP`, `INCOME`, `AMORTIZATION`, `SUBSCRIPTION`

---

## API — Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/auth/register` | Cadastro de usuário |
| `POST` | `/auth/login` | Login |
| `GET` | `/users/:userId/wallets` | Listar carteiras |
| `POST` | `/users/:userId/wallets` | Criar carteira |
| `GET` | `/wallets/:walletId/assets` | Listar ativos |
| `POST` | `/wallets/:walletId/assets` | Adicionar ativo |
| `DELETE` | `/assets/:id` | Remover ativo |
| `GET` | `/wallets/:walletId/transactions` | Listar transações |
| `POST` | `/wallets/:walletId/transactions` | Registrar transação |
| `PUT` | `/transactions/:id` | Editar transação |
| `DELETE` | `/transactions/:id` | Remover transação |
| `GET` | `/wallets/:walletId/dividends` | Listar proventos |
| `POST` | `/wallets/:walletId/dividends` | Registrar provento |
| `DELETE` | `/dividends/:id` | Remover provento |
| `GET` | `/wallets/:walletId/dashboard` | Dashboard completo |
| `GET` | `/quotes/search` | Buscar tickers |
| `GET` | `/quotes/:ticker` | Cotação de um ticker |
| `GET` | `/health` | Health check |

---

## Instalação e Execução

### Pré-requisitos

- Node.js 18+
- PostgreSQL

### 1. Clonar o repositório

```bash
git clone https://github.com/jckrknaul/investidor-inteligente.git
cd investidor-inteligente
```

### 2. Configurar o backend

```bash
cd backend
cp .env.example .env
# Edite o .env com sua DATABASE_URL e demais variáveis
```

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/carteira_db"
PORT=3001
FRONTEND_URL="http://localhost:3000"
BRAPI_TOKEN=""   # Token da brapi.dev para cotações (opcional)
```

### 3. Configurar o frontend

```bash
cd frontend
cp .env.local.example .env.local
# Edite o .env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=seu-segredo-aleatorio-longo
```

### 4. Instalar dependências e migrar o banco

```bash
# Na raiz do projeto
cd backend && npm install
cd ../frontend && npm install
cd ..

# Rodar migrações do banco
npm run setup:db
```

### 5. Rodar o projeto

Em dois terminais separados:

```bash
# Terminal 1 — Backend (http://localhost:3001)
npm run backend

# Terminal 2 — Frontend (http://localhost:3000)
npm run frontend
```

### Scripts disponíveis (raiz)

| Script | Descrição |
|--------|-----------|
| `npm run backend` | Sobe o backend em modo dev |
| `npm run frontend` | Sobe o frontend em modo dev |
| `npm run setup:db` | Roda as migrações do banco |
| `npm run db:studio` | Abre o Prisma Studio |
