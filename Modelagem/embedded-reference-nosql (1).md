# Embedded vs. Reference em Bancos de Dados Não Relacionais

**Disciplina:** IBD016 - Banco de Dados Não Relacional  
**Nível:** CST Ciência de Dados para Negócios  
**Público:** Estudantes de desenvolvimento backend e ciência de dados

---

## 1. Conceitos Fundamentais

### 1.1 O Problema Relacional

Em bancos relacionais, dados relacionados vivem em tabelas separadas:

```sql
-- Banco Relacional (PostgreSQL)
CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    nome VARCHAR(100),
    email VARCHAR(100)
);

CREATE TABLE enderecos (
    id INTEGER PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id),
    rua VARCHAR(100),
    cidade VARCHAR(50)
);

-- Consulta: JOIN necessário
SELECT u.nome, e.rua 
FROM usuarios u
JOIN enderecos e ON u.id = e.usuario_id
WHERE u.id = 1;
```

**Desvantagens:** múltiplas queries, latência de rede, complexidade de joins.

---

### 1.2 Mudança de Paradigma: Denormalização

NoSQL permite (e incentiva) denormalização controlada:

> **Denormalização em NoSQL** = armazenar dados relacionados no mesmo documento ou coleção, reduzindo a necessidade de joins.

**Dois padrões principais:**
1. **Embedded (Aninhamento)** — dados relacionados vivem dentro do documento
2. **Reference (Referência)** — apenas IDs são armazenados; consultas separadas resolvem

---

## 2. Pattern: Embedded (Aninhamento)

### 2.1 Definição

Embedded significa **copiar dados relacionados dentro do documento pai**.

```json
// Documento com endereço EMBUTIDO
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "nome": "João Silva",
  "email": "joao@example.com",
  "endereco": {
    "rua": "Av. Paulista, 1000",
    "numero": 1000,
    "complemento": "Apto 1501",
    "cidade": "São Paulo",
    "estado": "SP",
    "cep": "01311-100"
  }
}
```

### 2.2 Quando Usar Embedded

| Cenário | Justificativa | Exemplo |
|---------|--------------|---------|
| **1:1 Relationship** | Um usuário tem UM endereço principal | Perfil + Bio + Preferências |
| **1:N (cardinalidade baixa)** | Um usuário tem POUCOS documentos filhos | Pessoa + até 5 telefones |
| **Dados imutáveis** | O dado embutido não muda independentemente | Dados históricos, snapshots |
| **Leitura frequente** | Acesso ao documento principal já traz tudo necessário | Listagem de produtos com avaliações |
| **Atualização atômica** | Precisa garantir consistência de múltiplos campos | Carrinho de compras com itens |

### 2.3 Implementação em MongoDB

```javascript
// Insert com dados aninhados
db.usuarios.insertOne({
  _id: ObjectId(),
  nome: "Maria Santos",
  email: "maria@example.com",
  perfil: {
    avatar_url: "https://...",
    bio: "Desenvolvedora Full Stack",
    data_criacao: new Date()
  },
  telefones: [
    { tipo: "celular", numero: "11999999999" },
    { tipo: "comercial", numero: "1133333333" }
  ]
});

// Query simples - sem JOINs
db.usuarios.findOne({ "nome": "Maria Santos" });

// Acesso a campo aninhado
db.usuarios.find({ "perfil.bio": { $regex: "Full Stack" } });

// Atualizar campo específico dentro do array
db.usuarios.updateOne(
  { _id: ObjectId("...") },
  { $set: { "telefones.0.numero": "11988888888" } }
);
```

### 2.4 Limitações do Embedded

⚠️ **Problemas a considerar:**

#### 2.4.1 Tamanho de Documento
MongoDB limita documentos a **16 MB**. Embedded agressivo pode exceder:

```javascript
// ❌ PROBLEMA: Usuário com MUITOS pedidos embutidos
{
  _id: 1,
  nome: "Cliente",
  pedidos: [
    { id: 1, itens: [...], total: 1000 },
    { id: 2, itens: [...], total: 2000 },
    // ... 10.000 pedidos depois, ultrapassa 16 MB
  ]
}
```

#### 2.4.2 Duplicação de Dados
Dados embutidos podem ficar desatualizados:

```javascript
// ❌ INCONSISTÊNCIA: Produto embutido em múltiplos pedidos
// Coleção: pedidos
{
  _id: 1,
  cliente: "João",
  itens: [
    { id_produto: 1, nome: "Notebook", preco: 2000 },
    { id_produto: 2, nome: "Mouse", preco: 50 }
  ]
},
{
  _id: 2,
  cliente: "Maria",
  itens: [
    { id_produto: 1, nome: "Notebook", preco: 2000 }  // Se preço mudar...?
  ]
}
```

#### 2.4.3 Atualizações Custosas
Modificar dado embutido replicado exige múltiplas updates:

```javascript
// Problema: Mudar nome do produto em TODOS os pedidos
db.pedidos.updateMany(
  { "itens.id_produto": 1 },
  { $set: { "itens.$.nome": "Notebook Dell" } }
);
// Operação custosa se dados replicados em milhares de docs
```

---

## 3. Pattern: Reference (Referência)

### 3.1 Definição

Reference significa **armazenar apenas o ID de relacionamento**, similar a Foreign Keys em SQL.

```json
// Usuário COM REFERÊNCIA ao endereço
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "nome": "João Silva",
  "email": "joao@example.com",
  "endereco_id": ObjectId("507f191e8d8f4629dc9ee4a1")
}

// Documento separado: Endereço
{
  "_id": ObjectId("507f191e8d8f4629dc9ee4a1"),
  "rua": "Av. Paulista, 1000",
  "numero": 1000,
  "cidade": "São Paulo"
}
```

### 3.2 Quando Usar Reference

| Cenário | Justificativa | Exemplo |
|---------|--------------|---------|
| **1:N (cardinalidade alta)** | Muitos documentos filhos (1000+) | Usuário com 50.000 pedidos |
| **N:M Relationships** | Muitos-para-muitos | Produtos ↔ Categorias |
| **Dados independentes** | Filho tem ciclo de vida próprio | Pedido pode existir sem usuário? |
| **Dados mutáveis** | Precisam ser atualizados independentemente | Endereço do cliente muda frequentemente |
| **Compartilhamento** | Múltiplos documentos referenciam o mesmo recurso | Produto em múltiplos pedidos |

### 3.3 Implementação em MongoDB

#### 3.3.1 Insert com Referências

```javascript
// Inserir endereço
const endereco_id = db.enderecos.insertOne({
  rua: "Rua Augusta, 500",
  numero: 500,
  cidade: "São Paulo",
  estado: "SP"
}).insertedId;

// Inserir usuário com referência
db.usuarios.insertOne({
  _id: ObjectId(),
  nome: "Ana Costa",
  email: "ana@example.com",
  endereco_id: endereco_id  // Apenas ID
});
```

#### 3.3.2 Queries com Referências

**Solução 1: Dois Queries (Traditional)**

```javascript
// Query 1: Buscar usuário
const usuario = db.usuarios.findOne({ _id: ObjectId("...") });

// Query 2: Buscar endereço usando ID referenciado
const endereco = db.enderecos.findOne({ _id: usuario.endereco_id });

console.log(`${usuario.nome} mora em ${endereco.cidade}`);
```

**Solução 2: MongoDB Aggregation Framework (JOIN-like)**

```javascript
// Agregação com $lookup (semelhante a LEFT JOIN)
db.usuarios.aggregate([
  { $match: { _id: ObjectId("...") } },
  {
    $lookup: {
      from: "enderecos",
      localField: "endereco_id",
      foreignField: "_id",
      as: "endereco_info"
    }
  },
  { $unwind: "$endereco_info" },  // Desempacotar array
  {
    $project: {
      _id: 1,
      nome: 1,
      "endereco_info.rua": 1,
      "endereco_info.cidade": 1
    }
  }
]);

// Resultado
[
  {
    _id: ObjectId("507f1f77bcf86cd799439011"),
    nome: "Ana Costa",
    endereco_info: {
      rua: "Rua Augusta, 500",
      cidade: "São Paulo"
    }
  }
]
```

#### 3.3.3 Atualizações com Referência

```javascript
// Atualizar endereço (independente)
db.enderecos.updateOne(
  { _id: ObjectId("507f191e8d8f4629dc9ee4a1") },
  { $set: { cidade: "Campinas" } }
);
// Usuário NÃO é afetado — apenas uma atualização!
```

---

## 4. Comparação Prática: Caso de Uso Real

### Cenário: iFood (Da disciplina IBD016)

Modelar: **Restaurante → Pratos → Avaliações**

#### 4.1 Abordagem EMBEDDED

```javascript
db.restaurantes.insertOne({
  _id: ObjectId(),
  nome: "Pizzaria Gourmet",
  categoria: "Italiano",
  pratos: [
    {
      id_prato: 1,
      nome: "Margherita",
      preco: 45.00,
      ingredientes: ["Tomate", "Mozzarella", "Manjericão"],
      avaliacoes: [
        { usuario: "João", nota: 5, comentario: "Deliciosa!" },
        { usuario: "Maria", nota: 4, comentario: "Boa massa" }
      ]
    },
    {
      id_prato: 2,
      nome: "Pepperoni",
      preco: 52.00,
      ingredientes: ["Tomate", "Mozzarella", "Pepperoni"],
      avaliacoes: [
        { usuario: "Pedro", nota: 5, comentario: "Perfeita!" }
      ]
    }
  ]
});
```

**Vantagens:**
✅ Query única para restaurante + pratos + avaliações  
✅ Atualizações atômicas  
✅ Sem JOINs

**Desvantagens:**
❌ Se muitos pratos (100+) e cada um com 1000s de avaliações → 16 MB+  
❌ Mudar preço de um prato requer update no restaurante  
❌ Difícil filtrar todas as avaliações de um usuário  

---

#### 4.2 Abordagem REFERENCE

```javascript
// Coleção: restaurantes
db.restaurantes.insertOne({
  _id: ObjectId("rest_001"),
  nome: "Pizzaria Gourmet",
  categoria: "Italiano",
  telefone: "1133334444"
});

// Coleção: pratos
db.pratos.insertMany([
  {
    _id: ObjectId("prato_001"),
    restaurante_id: ObjectId("rest_001"),
    nome: "Margherita",
    preco: 45.00,
    ingredientes: ["Tomate", "Mozzarella", "Manjericão"],
    ativo: true
  },
  {
    _id: ObjectId("prato_002"),
    restaurante_id: ObjectId("rest_001"),
    nome: "Pepperoni",
    preco: 52.00,
    ingredientes: ["Tomate", "Mozzarella", "Pepperoni"],
    ativo: true
  }
]);

// Coleção: avaliacoes
db.avaliacoes.insertMany([
  {
    _id: ObjectId("aval_001"),
    prato_id: ObjectId("prato_001"),
    usuario: "João",
    nota: 5,
    comentario: "Deliciosa!",
    data: new Date("2026-09-01")
  },
  {
    _id: ObjectId("aval_002"),
    prato_id: ObjectId("prato_001"),
    usuario: "Maria",
    nota: 4,
    comentario: "Boa massa",
    data: new Date("2026-09-02")
  }
]);
```

**Vantagens:**
✅ Sem limite de tamanho  
✅ Dados atualizados em um único lugar  
✅ Fácil consultar todas as avaliações de um usuário  
✅ Escalável

**Desvantagens:**
❌ Múltiplas queries ou agregação complexa  
❌ Latência aumentada  
❌ Menos atômico

---

#### 4.3 Comparação de Queries

**Buscar restaurante com seus pratos (EMBEDDED):**
```javascript
db.restaurantes.findOne({ _id: ObjectId("rest_001") });
// 1 query, 1 round-trip
```

**Buscar restaurante com seus pratos (REFERENCE):**
```javascript
db.restaurantes.aggregate([
  { $match: { _id: ObjectId("rest_001") } },
  {
    $lookup: {
      from: "pratos",
      localField: "_id",
      foreignField: "restaurante_id",
      as: "pratos"
    }
  }
]);
// 1 aggregation (internamente 2 queries)
```

**Buscar pratos com avaliações (EMBEDDED):**
```javascript
db.restaurantes.findOne(
  { _id: ObjectId("rest_001") },
  { "pratos._id": 1, "pratos.avaliacoes": 1 }
);
// Precisa desempacotar manualmente
```

**Buscar pratos com avaliações (REFERENCE):**
```javascript
db.pratos.aggregate([
  { $match: { restaurante_id: ObjectId("rest_001") } },
  {
    $lookup: {
      from: "avaliacoes",
      localField: "_id",
      foreignField: "prato_id",
      as: "avaliacoes"
    }
  }
]);
// Clean e escalável
```

---

## 5. Estratégias Híbridas

### 5.1 Embedded + Reference Combinado

**Realidade:** Muitos projetos usam AMBOS!

```javascript
// Melhor dos dois mundos
db.pedidos.insertOne({
  _id: ObjectId("pedido_001"),
  usuario_id: ObjectId("user_001"),  // Reference ao usuário
  
  // Dados do usuário COPIADOS (snapshot)
  usuario_snapshot: {
    nome: "João Silva",
    email: "joao@example.com",
    endereco_entrega: {
      rua: "Av. Paulista",
      cidade: "São Paulo"
    }
  },
  
  itens: [  // Embedded (poucos itens)
    {
      prato_id: ObjectId("prato_001"),  // Reference ao prato
      nome: "Pizza Margherita",  // CÓPIA do nome
      preco: 45.00,  // SNAPSHOT do preço na época
      quantidade: 2
    }
  ],
  
  total: 90.00,
  data_pedido: new Date(),
  status: "entregue"
});
```

**Lógica:**
- ✅ Reference ao usuário (pode mudar perfil)
- ✅ Snapshot de dados críticos (para histórico)
- ✅ Embedded de itens (poucos, relação clara)
- ✅ Reference ao prato (para rastrear histórico de menu)

---

### 5.2 Denormalização Seletiva

```javascript
// Coleção: Tweets (simplificado)
db.tweets.insertOne({
  _id: ObjectId(),
  autor_id: ObjectId("user_123"),
  
  // Dados desnormalizados (update raro)
  autor: {
    nome: "Maria Dev",
    avatar: "https://...",
    followers_count: 5000  // Cache do contador!
  },
  
  conteudo: "MongoDB rocks!",
  likes: 150,
  
  // Retweets: apenas IDs (para não explodir tamanho)
  retweet_ids: [ObjectId(), ObjectId(), ...]
});
```

**Estratégia:** Denormalizar apenas dados que **atualizam raramente**.

---

## 6. Padrões Avançados

### 6.1 Denormalize on Write

```javascript
// Quando usuário muda nome, atualizar em TODOS os documentos relacionados
app.patch('/usuarios/:id', async (req, res) => {
  const usuario_id = ObjectId(req.params.id);
  const novo_nome = req.body.nome;
  
  // Update 1: Documento principal
  await db.usuarios.updateOne(
    { _id: usuario_id },
    { $set: { nome: novo_nome } }
  );
  
  // Update 2: Denormalized copies em comentários
  await db.comentarios.updateMany(
    { usuario_id: usuario_id },
    { $set: { "usuario.nome": novo_nome } }
  );
  
  // Update 3: Denormalized copies em posts
  await db.posts.updateMany(
    { usuario_id: usuario_id },
    { $set: { "autor.nome": novo_nome } }
  );
});
```

**Prós:** Leitura super rápida  
**Contras:** Escrita complexa; risco de inconsistência

---

### 6.2 Denormalize on Read

```javascript
// Função de enrichment
async function enricharUsuario(usuario) {
  // Buscar dados relacionados apenas ao exigir
  const endereco = await db.enderecos.findOne(
    { _id: usuario.endereco_id }
  );
  
  return {
    ...usuario,
    endereco: endereco
  };
}

// Uso
const usuario = db.usuarios.findOne({ _id: ObjectId() });
const usuarioEnriquecido = await enricharUsuario(usuario);
```

**Prós:** Escrita simples; atualização centralizada  
**Contras:** Múltiplas queries; latência aumentada

---

### 6.3 Cache Layer (Redis + MongoDB)

```javascript
// Combinar NoSQL document + key-value
const buscarRestaurante = async (id) => {
  // Check cache primeiro
  const cached = await redis.get(`restaurante:${id}`);
  if (cached) return JSON.parse(cached);
  
  // Se não, buscar MongoDB
  const restaurante = await db.restaurantes.findOne({ _id: ObjectId(id) });
  
  // Cachear por 1 hora
  await redis.setex(`restaurante:${id}`, 3600, JSON.stringify(restaurante));
  
  return restaurante;
};
```

---

## 7. Matriz de Decisão

| Aspecto | Embedded | Reference |
|--------|----------|-----------|
| **Tamanho de dados** | Pequeno (<1 MB/doc) | Grande (N documentos) |
| **Frequência de leitura** | Alta (muitas leituras) | Variável |
| **Frequência de escrita** | Baixa (atualiza raro) | Alta (atualiza freqüente) |
| **Relacionamento** | 1:1, 1:N (N pequeno) | 1:N (N grande), N:M |
| **Atomicidade** | Necessária | Não crítica |
| **Escalabilidade** | Limitada (16 MB) | Alta |
| **Joins** | Nenhum | Precisa agregação |
| **Consistência** | Forte | Eventual |
| **Exemplo clássico** | Endereço + usuário | Pedidos + produtos |

---

## 8. Exercícios Práticos

### 8.1 Exercício 1: Modelar Blog

**Requisitos:**
- Cada blog post tem 1 autor, múltiplos comentários (0-10.000)
- Comentários têm texto, data, autor, respostas

**Pergunta:** Usar EMBEDDED ou REFERENCE? Por quê?

**Resposta esperada:** REFERENCE
- Comentários podem ser muitos (quebra 16 MB)
- Atualizar comentário não deve afetar post
- Buscar todos comentários de um usuário é caso de uso

---

### 8.2 Exercício 2: Modelar E-commerce

**Entidades:** Usuário, Carrinho, Pedido, Produto

**Pergunta:** Qual padrão para cada relacionamento?
- Usuário ↔ Carrinho
- Usuário ↔ Endereço
- Pedido ↔ Itens (produtos)
- Pedido ↔ Avaliações

**Resposta esperada:**
- Usuário ↔ Carrinho: **EMBEDDED** (1 carrinho ativo/usuário, pequeno)
- Usuário ↔ Endereço: **EMBEDDED** (1-5 endereços)
- Pedido ↔ Itens: **EMBEDDED** (snapshot, imutável)
- Pedido ↔ Avaliações: **REFERENCE** (muitas, dinâmicas)

---

### 8.3 Exercício 3: Script MongoDB

Implementar a modelagem iFood (restaurante + pratos + avaliações) em REFERENCE completa, com agregações para:
1. Listar pratos de um restaurante com média de avaliações
2. Listar últimas 5 avaliações de um prato
3. Buscar pratos com nota >= 4.5

---

## 9. Anti-Patterns Comuns

### ❌ Anti-Pattern 1: Embedded para TUDO

```javascript
// Problema: usuário com 1 BILHÃO de pedidos embutidos
{
  _id: 1,
  nome: "Cliente VIP",
  pedidos: [ ... BILHÕES ... ]  // Impossível!
}
```

### ❌ Anti-Pattern 2: Referências sem validação

```javascript
// Problema: prato_id aponta para prato inexistente
{
  _id: 1,
  prato_id: ObjectId("inexistente"),
  quantidade: 2
}
// MongoDB NÃO garante referential integrity!
```

### ❌ Anti-Pattern 3: Queries N+1

```javascript
// ❌ RUIM: Loop queries
const restaurantes = db.restaurantes.find().toArray();
restaurantes.forEach(rest => {
  const pratos = db.pratos.find({ restaurante_id: rest._id }).toArray();
  // N queries!
});

// ✅ BOM: Usar agregação
db.restaurantes.aggregate([
  {
    $lookup: {
      from: "pratos",
      localField: "_id",
      foreignField: "restaurante_id",
      as: "pratos"
    }
  }
]);
```

---

## 10. Resumo e Checklist

### Quando Usar EMBEDDED:

- [ ] Relacionamento 1:1 ou 1:N com N < 10
- [ ] Dados não se modificam independentemente
- [ ] Tamanho total < 16 MB
- [ ] Leitura do relacionamento é frequente
- [ ] Necessário atomicidade

### Quando Usar REFERENCE:

- [ ] N é grande (100+)
- [ ] Dados mudam frequentemente
- [ ] Múltiplos documentos referenciam o mesmo recurso
- [ ] Relacionamento N:M
- [ ] Escalabilidade é crítica

### Padrão Híbrido (Melhor Prática):

- [ ] REFERENCE para relacionamentos críticos
- [ ] EMBEDDED para dados complementares (pequenos)
- [ ] SNAPSHOT para dados históricos (cópias)
- [ ] AGREGAÇÃO para queries complexas

---

## 11. Referências e Recursos

**MongoDB Official:**
- [Data Modeling in MongoDB](https://docs.mongodb.com/manual/core/data-modeling-introduction/)
- [$lookup Aggregation](https://docs.mongodb.com/manual/reference/operator/aggregation/lookup/)

**Artigos:**
- MongoDB: "Six Rules of Thumb for MongoDB Schema Design"
- "Relational Database Design vs. NoSQL Database Design" (comparativa)

**Ferramentas:**
- MongoDB Compass (visual data modeling)
- NoSQLBooster (query builder)

---

## 12. Conclusão

**Embedded vs. Reference não é binário — é um espectro.**

A escolha depende de:
1. **Frequência de acesso** (read vs. write)
2. **Tamanho de dados**
3. **Atomicidade necessária**
4. **Escalabilidade futura**

**Regra de Ouro:** "Organize seus documentos para refletir a forma como sua aplicação os acessa."

---

**Próximos Tópicos:** Indexação em NoSQL, Replicação, Sharding, Transactions em MongoDB.
