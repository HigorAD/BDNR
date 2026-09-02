# Guia Visual: Decisão Embedded vs. Reference

**IBD016 - Banco de Dados Não Relacional**  
**Versão Prática para Tomada de Decisão**

---

## 1. Árvore de Decisão Rápida

```
┌─ Qual é o relacionamento?
│
├─ 1:1 (Um para Um)
│  ├─ Dados pequenos (<500KB)?
│  │  └─ SIM → EMBEDDED ✅
│  └─ Dados grandes?
│     └─ Não → REFERENCE 📍
│
├─ 1:N (Um para Muitos)
│  ├─ Quantos filhos?
│  │  ├─ Poucos (< 10)?
│  │  │  ├─ Dados imutáveis?
│  │  │  │  └─ SIM → EMBEDDED ✅
│  │  │  └─ Dados mudam frequentemente?
│  │  │     └─ NÃO → REFERENCE 📍
│  │  │
│  │  └─ Muitos (100+)?
│  │     └─ REFERENCE 📍 (sempre)
│  │
│  └─ Precisa listar filhos isoladamente?
│     └─ SIM → REFERENCE 📍
│
└─ N:M (Muitos para Muitos)
   └─ REFERENCE 📍 (sempre com tabela intermediária)
```

---

## 2. Matriz de Decisão Detalhada

### Critério: Tamanho de Dados

| Tamanho | Embedded | Reference |
|---------|:--------:|:---------:|
| < 1 KB | ✅✅ | ⚠️  |
| 1-100 KB | ✅ | ✅ |
| 100 KB - 1 MB | ⚠️  | ✅✅ |
| 1-16 MB | ❌ | ✅✅ |
| > 16 MB | ❌❌ | ✅✅ |

**Limite MongoDB:** Documentos ≤ 16 MB

---

### Critério: Frequência de Atualização

| Frequência | Embedded | Reference |
|-----------|:--------:|:---------:|
| Raramente (< 1x/ano) | ✅✅ | ✅ |
| Ocasionalmente (1x/mês) | ✅ | ✅ |
| Frequentemente (1x/dia) | ⚠️  | ✅ |
| Muito frequente (1x/min) | ❌ | ✅✅ |
| Tempo real | ❌❌ | ✅✅ |

---

### Critério: Padrão de Leitura

| Padrão | Embedded | Reference |
|--------|:--------:|:---------:|
| Sempre junto | ✅✅ | ✅ |
| Frequentemente junto | ✅ | ✅ |
| Às vezes junto | ⚠️  | ✅ |
| Raramente junto | ❌ | ✅ |
| Sempre separado | ❌ | ✅✅ |

---

### Critério: Cardinalidade (1:N)

| N (Quantidade) | Embedded | Reference |
|---|:--------:|:---------:|
| 1-5 | ✅✅ | ⚠️  |
| 5-50 | ✅ | ✅ |
| 50-1000 | ⚠️  | ✅ |
| 1000+ | ❌ | ✅✅ |
| Ilimitado | ❌❌ | ✅✅ |

---

## 3. Checklist de Decisão

### Para cada relacionamento, responda:

#### Seção A: Características dos Dados

- [ ] **A1:** Os dados filho têm ciclo de vida independente do pai?
  - SIM → Preferir **REFERENCE** 📍
  - NÃO → Preferir **EMBEDDED** ✅

- [ ] **A2:** Quantos documentos filhos existem por pai?
  - 1-10 → Preferir **EMBEDDED** ✅
  - 10-100 → Considerar **EMBEDDED** ⚠️
  - 100+ → Exigir **REFERENCE** 📍

- [ ] **A3:** Qual é o tamanho total dos dados filhos?
  - < 1 MB → Preferir **EMBEDDED** ✅
  - 1-10 MB → Considerar **EMBEDDED** ⚠️
  - > 10 MB → Exigir **REFERENCE** 📍

#### Seção B: Padrões de Acesso

- [ ] **B1:** Com que frequência acessa filho + pai juntos?
  - Sempre (>80% das queries) → Preferir **EMBEDDED** ✅
  - Frequentemente (50-80%) → Considerar **EMBEDDED** ⚠️
  - Raramente (<50%) → Preferir **REFERENCE** 📍

- [ ] **B2:** Com que frequência acessa filho isoladamente?
  - Nunca (<10%) → Preferir **EMBEDDED** ✅
  - Às vezes (10-50%) → Considerar **EMBEDDED** ⚠️
  - Frequentemente (>50%) → Exigir **REFERENCE** 📍

- [ ] **B3:** Precisa filtrar filhos sem o pai?
  - Não → Preferir **EMBEDDED** ✅
  - Sim, raramente → Considerar **EMBEDDED** ⚠️
  - Sim, frequentemente → Exigir **REFERENCE** 📍

#### Seção C: Operações de Escrita

- [ ] **C1:** Com que frequência adiciona/remove filhos?
  - Raramente → Preferir **EMBEDDED** ✅
  - Às vezes → Considerar **EMBEDDED** ⚠️
  - Frequentemente → Preferir **REFERENCE** 📍

- [ ] **C2:** Precisa de atualização atômica (pai + filhos)?
  - Sim, crítico → Exigir **EMBEDDED** ✅
  - Não crítico → Aceitar **REFERENCE** 📍

- [ ] **C3:** Múltiplos documentos compartilham o mesmo filho?
  - Não (relação 1:1) → Preferir **EMBEDDED** ✅
  - Às vezes (poucos) → Considerar **EMBEDDED** ⚠️
  - Sim (muitos) → Exigir **REFERENCE** 📍

#### Seção D: Consistência e Escalabilidade

- [ ] **D1:** Qual é o nível de consistência necessária?
  - Forte (mesma transação) → Exigir **EMBEDDED** ✅
  - Eventual (segundos) → Aceitar **REFERENCE** 📍

- [ ] **D2:** Qual é o tamanho esperado em 5 anos?
  - Pequeno (< 10 GB) → Preferir **EMBEDDED** ✅
  - Médio (10-100 GB) → Considerar **EMBEDDED** ⚠️
  - Grande (> 100 GB) → Exigir **REFERENCE** 📍

### Resultado: Contar Respostas

**EMBEDDED:** 5+ pontos → Use **Embedded**  
**REFERENCE:** 5+ pontos → Use **Reference**  
**AMBÍGUO:** Equilibrado → Use **Padrão Híbrido**

---

## 4. Padrões de Uso: Por Tipo de Dado

### Usuário + Endereço(s)

```
Relacionamento:  1:1 ou 1:N (N pequeno)
Cardinalidade:   1-5 endereços
Tamanho:         Cada endereço < 1 KB
Atualização:     Ocasional
Leitura:         Sempre junto

RECOMENDAÇÃO: ✅ EMBEDDED
```

**Implementação:**
```javascript
db.usuarios.insertOne({
  _id: ObjectId(),
  nome: "João",
  enderecos: [
    { tipo: "residência", rua: "Av. A" },
    { tipo: "comercial", rua: "Rua B" }
  ]
})
```

---

### Usuário + Pedidos

```
Relacionamento:  1:N (N grande)
Cardinalidade:   Centenas de pedidos
Tamanho:         Cumulativo > 16 MB
Atualização:     Frequente (novos pedidos)
Leitura:         Frequentemente separado

RECOMENDAÇÃO: 📍 REFERENCE
```

**Implementação:**
```javascript
db.usuarios.insertOne({
  _id: ObjectId(),
  nome: "João"
})

db.pedidos.insertMany([
  { usuario_id: ObjectId(), itens: [...], total: 100 },
  { usuario_id: ObjectId(), itens: [...], total: 200 }
])
```

---

### Prato + Avaliações

```
Relacionamento:  1:N (N muito grande)
Cardinalidade:   Milhares de avaliações
Tamanho:         Crescimento ilimitado
Atualização:     Muito frequente (novas avaliações)
Leitura:         Frequentemente paginado

RECOMENDAÇÃO: 📍 REFERENCE
```

**Implementação:**
```javascript
db.pratos.insertOne({
  _id: ObjectId(),
  nome: "Pizza Margherita"
})

db.avaliacoes.insertMany([
  { prato_id: ObjectId(), usuario: "João", nota: 5 },
  { prato_id: ObjectId(), usuario: "Maria", nota: 4 }
])
```

---

### Pedido + Itens

```
Relacionamento:  1:N (N fixo)
Cardinalidade:   10-50 itens por pedido
Tamanho:         Pequeno (< 100 KB)
Atualização:     Nunca (histórico imutável)
Leitura:         Sempre junto
Atomicidade:     Crítica

RECOMENDAÇÃO: ✅ EMBEDDED
```

**Implementação:**
```javascript
db.pedidos.insertOne({
  _id: ObjectId(),
  cliente_id: ObjectId(),
  itens: [
    { prato_id: ObjectId(), nome: "Pizza", preco: 45 },
    { prato_id: ObjectId(), nome: "Cerveja", preco: 12 }
  ],
  total: 57
})
```

---

### Produto + Categorias (N:M)

```
Relacionamento:  N:M
Cardinalidade:   Produto em 2-10 categorias
Tamanho:         Pequeno
Atualização:     Ocasional
Leitura:         Às vezes junto, às vezes separado

RECOMENDAÇÃO: 📍 REFERENCE (com array de IDs)
```

**Implementação:**
```javascript
db.produtos.insertOne({
  _id: ObjectId(),
  nome: "Smartphone",
  categoria_ids: [
    ObjectId("eletronicos"),
    ObjectId("celulares"),
    ObjectId("oferta")
  ]
})

db.categorias.find({ _id: { $in: [...] } })
```

---

### Postagem + Comentários

```
Relacionamento:  1:N (N variável)
Cardinalidade:   Viral: 100.000+ comentários
Tamanho:         Muito grande
Atualização:     Muito frequente
Leitura:         Paginado (primeiros 10, depois scroll)

RECOMENDAÇÃO: 📍 REFERENCE
```

**Implementação:**
```javascript
db.posts.insertOne({
  _id: ObjectId(),
  autor: "Maria",
  texto: "Olá mundo!",
  comentarios_count: 12345  // Cache do total
})

db.comentarios.find({ post_id: ObjectId() })
  .sort({ data: -1 })
  .limit(10)
  .skip(0)
```

---

## 5. Comparação: Exemplos Reais

### E-commerce (Shopee, Amazon, Mercado Livre)

| Entidade | Pai | Filho | Padrão | Razão |
|----------|-----|-------|--------|-------|
| Usuário | Usuario | Endereço | ✅ EMBEDDED | Poucos, pequeno, junto |
| Produto | Produto | Imagem | ✅ EMBEDDED | 5-20 imagens, junto |
| Produto | Produto | Avaliação | 📍 REFERENCE | 1000+, paginado |
| Pedido | Pedido | Item | ✅ EMBEDDED | Snapshot, imutável |
| Carrinho | Carrinho | Item | ✅ EMBEDDED | Poucos, junto, transitório |

---

### Rede Social (Instagram, Twitter, TikTok)

| Entidade | Pai | Filho | Padrão | Razão |
|----------|-----|-------|--------|-------|
| Usuário | Usuario | Post | 📍 REFERENCE | 10.000+, ciclo próprio |
| Post | Post | Like | 📍 REFERENCE | 1.000.000+, análise separada |
| Post | Post | Comentário | 📍 REFERENCE | 100.000+, paginado |
| Comentário | Comentario | Reply | ⚠️ HÍBRIDO | 100+, dentro do comentário |
| Usuário | Usuario | Seguidor | 📍 REFERENCE | N:M, análise separada |

---

### Banco de Dados (CAIXA, Bradesco)

| Entidade | Pai | Filho | Padrão | Razão |
|----------|-----|-------|--------|-------|
| Conta | Conta | Transação | 📍 REFERENCE | 1.000.000+, auditoria |
| Transação | Transacao | Comprovante | ✅ EMBEDDED | 1 por transação, junto |
| Cliente | Cliente | Empréstimo | 📍 REFERENCE | 5-20, ciclo próprio |
| Empréstimo | Emprestimo | Parcela | ✅ EMBEDDED | Fixas, imutáveis |

---

## 6. Tabela de Decisão: Pronto para Usar

**Copie e adapte para seu projeto:**

```
PROJETO: ________________
ENTIDADE PAI: ________________
ENTIDADE FILHA: ________________

┌─────────────────────────────────────────────────────────────┐
│ PERGUNTA                          │ RESPOSTA │ PESO EMBEDDED │
├─────────────────────────────────────────────────────────────┤
│ Quantos filhos por pai?           │ _______ │ ________ |
│ Tamanho total dos filhos?         │ _______ │ ________ |
│ Atualiza filhos frequentemente?   │ Sim/Não │ ________ |
│ Acessa filhos isoladamente?       │ Sim/Não │ ________ |
│ Precisa de atomicidade?           │ Sim/Não │ ________ |
│ Filhos compartilhados (N:M)?      │ Sim/Não │ ________ |
│                                   │         │          |
│ TOTAL DE PONTOS                   │         │ ________ |
│                                   │         │          |
│ > 4: EMBEDDED ✅                  │         │          |
│ < 2: REFERENCE 📍                 │         │          |
│ 2-4: HÍBRIDO ⚠️                   │         │          |
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Anti-Patterns: Evitar!

### ❌ Anti-Pattern 1: Embedded Para TUDO

```javascript
// PÉSSIMO: Usuário com 1 BILHÃO de transações embutidas
{
  _id: 1,
  nome: "Cliente VIP",
  transacoes: [ ... BILHÕES ... ]
}
```

**Problema:** Ultrapassa 16 MB, impossível recuperar.

**Solução:** Usar REFERENCE para coleções grandes.

---

### ❌ Anti-Pattern 2: Referências Sem Validação

```javascript
// PROBLEMA: prato_id aponta para prato inexistente
{
  _id: 1,
  prato_id: ObjectId("inexistente"),
  quantidade: 2
}
```

**Problema:** MongoDB NÃO garante referential integrity (Foreign Keys).

**Solução:** Validar no aplicativo ou usar transações ACID.

---

### ❌ Anti-Pattern 3: Queries N+1

```javascript
// PÉSSIMO: Loop de queries
const usuarios = db.usuarios.find().toArray()
usuarios.forEach(user => {
  const endereco = db.enderecos.findOne({ usuario_id: user._id })
  // N queries!
})
```

**Problema:** Latência acumulada, 1000 usuários = 1000 queries.

**Solução:** Usar agregação com $lookup.

---

### ❌ Anti-Pattern 4: Duplicação Descontrolada

```javascript
// PROBLEMA: Nome do produto em todos os pedidos
// Mudar nome = atualizar 10.000 pedidos
db.pedidos.updateMany(
  { "itens.nome": "Notebook" },
  { $set: { "itens.$.nome": "Notebook Dell XPS" } }
)
```

**Problema:** Atualização custosa e risco de inconsistência.

**Solução:** Guardar apenas SNAPSHOT (preço da época), não dados vivos.

---

## 8. Resumo: Regra de Ouro

### 🏆 A Melhor Prática

> **"Organize seus documentos para refletir a forma como sua aplicação os acessa."**

1. **Análise de Queries:**
   - Com que frequência precisa de pai + filho juntos?
   - Com que frequência acessa filho isoladamente?

2. **Análise de Atualização:**
   - Filho muda independentemente?
   - Precisa atualização atômica?

3. **Análise de Escala:**
   - Quantos filhos?
   - Tamanho total?
   - Crescimento futuro?

4. **Escolha:**
   - Juntos + Poucos + Pequeno → **EMBEDDED** ✅
   - Separados + Muitos + Grande → **REFERENCE** 📍
   - Híbrido → **Usar Ambos** ⚠️

---

## 9. Checklist Final: Antes de Implementar

- [ ] Identifiquei todos os relacionamentos?
- [ ] Fiz análise de cardinalidade?
- [ ] Analisei padrões de leitura?
- [ ] Considerei padrões de escrita?
- [ ] Consultei matriz de decisão?
- [ ] Defini índices necessários?
- [ ] Planejei escalabilidade futura?
- [ ] Documentei decisões (por quê?)?
- [ ] Fiz prototype (teste com dados reais)?
- [ ] Validei performance com queries reais?

---

**Próximas Disciplinas:** Indexação, Replicação, Sharding, Transactions.

**Dúvidas?** Consultar matriz de decisão ou executar exemplos práticos!
