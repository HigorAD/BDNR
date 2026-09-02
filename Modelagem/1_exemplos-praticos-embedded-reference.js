/**
 * EXEMPLOS PRÁTICOS E EXECUTÁVEIS
 * Embedded vs. Reference em MongoDB
 * IBD016 - Banco de Dados Não Relacional
 * 
 * Como usar:
 * 1. Conectar ao MongoDB: mongosh
 * 2. Selecionar DB: use ibf016_exemplo
 * 3. Copiar e colar cada bloco de código
 */

// ============================================================================
// PARTE 1: SETUP - Limpar e preparar coleções
// ============================================================================

// Criar banco de dados
use ibd016_exemplo

// Limpar coleções anteriores (CUIDADO: deleta tudo!)
db.usuarios.deleteMany({})
db.restaurantes_emb.deleteMany({})
db.restaurantes_ref.deleteMany({})
db.pratos.deleteMany({})
db.avaliacoes.deleteMany({})
db.pedidos.deleteMany({})
db.enderecos.deleteMany({})

console.log("✅ Banco preparado para exemplos")

// ============================================================================
// PARTE 2: EXEMPLO 1 - USUÁRIO COM ENDEREÇO (SIMPLE 1:1)
// ============================================================================

console.log("\n=== EXEMPLO 1: Usuário + Endereço ===")

// --- ABORDAGEM EMBEDDED ---
db.usuarios.insertOne({
  _id: ObjectId(),
  nome: "João Silva",
  email: "joao@example.com",
  telefone: "11999999999",
  endereco: {
    rua: "Av. Paulista",
    numero: 1000,
    complemento: "Apto 1501",
    cidade: "São Paulo",
    estado: "SP",
    cep: "01311-100"
  },
  data_criacao: new Date()
})

// Query: buscar usuário com endereço (SEM JOIN)
db.usuarios.findOne({ nome: "João Silva" })

// Query: buscar por cidade (field aninhado)
db.usuarios.findOne({ "endereco.cidade": "São Paulo" })

// Atualizar campo aninhado
db.usuarios.updateOne(
  { nome: "João Silva" },
  { $set: { "endereco.numero": 1500 } }
)

console.log("✅ EMBEDDED: 1 query, tudo junto")

// --- ABORDAGEM REFERENCE ---
// Inserir endereço
const endereco_id = db.enderecos.insertOne({
  rua: "Rua Augusta",
  numero: 500,
  complemento: "Sala 300",
  cidade: "São Paulo",
  estado: "SP",
  cep: "01305-100"
}).insertedId

// Inserir usuário com referência
db.usuarios.insertOne({
  _id: ObjectId(),
  nome: "Maria Santos",
  email: "maria@example.com",
  telefone: "11988888888",
  endereco_id: endereco_id,
  data_criacao: new Date()
})

// Query 1: Buscar usuário
const usuario_ref = db.usuarios.findOne({ nome: "Maria Santos" })

// Query 2: Buscar endereço (precisa de outro lookup)
const endereco_completo = db.enderecos.findOne({ _id: usuario_ref.endereco_id })

console.log("✅ REFERENCE: 2 queries separadas OU 1 agregação")

// Usar agregação (JOIN-like)
db.usuarios.aggregate([
  { $match: { nome: "Maria Santos" } },
  {
    $lookup: {
      from: "enderecos",
      localField: "endereco_id",
      foreignField: "_id",
      as: "endereco_info"
    }
  },
  { $unwind: "$endereco_info" }
])

// ============================================================================
// PARTE 3: EXEMPLO 2 - RESTAURANTE + PRATOS (1:N - Cardápio)
// ============================================================================

console.log("\n=== EXEMPLO 2: Restaurante + Pratos ===")

// --- ABORDAGEM EMBEDDED ---
db.restaurantes_emb.insertOne({
  _id: ObjectId("507f1f77bcf86cd799439001"),
  nome: "Pizzaria Gourmet",
  categoria: "Italiano",
  telefone: "1133334444",
  endereco: "Av. Paulista, 2000",
  pratos: [
    {
      id_prato: 1,
      nome: "Margherita",
      descricao: "Tomate, Mozzarella, Manjericão",
      preco: 45.00,
      ingredientes: ["Tomate", "Mozzarella", "Manjericão"],
      tempo_preparo: 15,
      ativo: true
    },
    {
      id_prato: 2,
      nome: "Pepperoni",
      descricao: "Tomate, Mozzarella, Pepperoni",
      preco: 52.00,
      ingredientes: ["Tomate", "Mozzarella", "Pepperoni"],
      tempo_preparo: 15,
      ativo: true
    },
    {
      id_prato: 3,
      nome: "Quatro Queijos",
      descricao: "Mozzarella, Gorgonzola, Parmesão, Provolone",
      preco: 58.00,
      ingredientes: ["Mozzarella", "Gorgonzola", "Parmesão", "Provolone"],
      tempo_preparo: 18,
      ativo: true
    }
  ]
})

// Query: Restaurante com todos pratos
db.restaurantes_emb.findOne({ _id: ObjectId("507f1f77bcf86cd799439001") })

// Query: Buscar restaurante pelos pratos ativos
db.restaurantes_emb.findOne({ "pratos.ativo": true })

// Query: Pratos com preço > 50
db.restaurantes_emb.findOne(
  { _id: ObjectId("507f1f77bcf86cd799439001") },
  { "pratos.$": { $gt: 50 } }  // Não funciona assim!
)

// Melhor: Agregação com filter
db.restaurantes_emb.aggregate([
  { $match: { _id: ObjectId("507f1f77bcf86cd799439001") } },
  {
    $addFields: {
      pratos_caros: {
        $filter: {
          input: "$pratos",
          as: "prato",
          cond: { $gte: ["$$prato.preco", 50] }
        }
      }
    }
  }
])

// Atualizar preço de um prato específico
db.restaurantes_emb.updateOne(
  { 
    _id: ObjectId("507f1f77bcf86cd799439001"),
    "pratos.id_prato": 1
  },
  { $set: { "pratos.$.preco": 48.00 } }
)

console.log("✅ EMBEDDED: Cardápio junto com restaurante")

// --- ABORDAGEM REFERENCE ---
db.restaurantes_ref.insertOne({
  _id: ObjectId("507f1f77bcf86cd799439002"),
  nome: "Restaurante Brasileira",
  categoria: "Brasileira",
  telefone: "1144445555",
  endereco: "Rua XV de Novembro, 300"
})

db.pratos.insertMany([
  {
    _id: ObjectId("prato_br_001"),
    restaurante_id: ObjectId("507f1f77bcf86cd799439002"),
    nome: "Feijoada Completa",
    descricao: "Feijão, carnes, acompanhamentos",
    preco: 65.00,
    ingredientes: ["Feijão", "Costela", "Linguiça", "Paio"],
    tempo_preparo: 30,
    ativo: true
  },
  {
    _id: ObjectId("prato_br_002"),
    restaurante_id: ObjectId("507f1f77bcf86cd799439002"),
    nome: "Moqueca de Peixe",
    descricao: "Peixe fresco com leite de coco",
    preco: 72.00,
    ingredientes: ["Peixe", "Leite de coco", "Tomate", "Pimenta"],
    tempo_preparo: 25,
    ativo: true
  }
])

// Query: Restaurante
db.restaurantes_ref.findOne({ _id: ObjectId("507f1f77bcf86cd799439002") })

// Query: Pratos do restaurante
db.pratos.find({ restaurante_id: ObjectId("507f1f77bcf86cd799439002") }).toArray()

// Query: Restaurante + Pratos com agregação
db.restaurantes_ref.aggregate([
  { $match: { _id: ObjectId("507f1f77bcf86cd799439002") } },
  {
    $lookup: {
      from: "pratos",
      localField: "_id",
      foreignField: "restaurante_id",
      as: "pratos"
    }
  }
])

// Query: Pratos caros (>60)
db.pratos.find({
  restaurante_id: ObjectId("507f1f77bcf86cd799439002"),
  preco: { $gt: 60 }
}).toArray()

// Atualizar preço (simples!)
db.pratos.updateOne(
  { _id: ObjectId("prato_br_001") },
  { $set: { preco: 70.00 } }
)

console.log("✅ REFERENCE: Pratos em coleção separada")

// ============================================================================
// PARTE 4: EXEMPLO 3 - PRATOS + AVALIAÇÕES (1:N - Muitas avaliações)
// ============================================================================

console.log("\n=== EXEMPLO 3: Pratos + Avaliações ===")

// --- ABORDAGEM EMBEDDED (não recomendado para muitas) ---
db.restaurantes_emb.updateOne(
  { _id: ObjectId("507f1f77bcf86cd799439001") },
  {
    $set: {
      "pratos.0.avaliacoes": [
        {
          usuario: "João Silva",
          nota: 5,
          comentario: "Massa perfeita!",
          data: new Date("2026-09-01")
        },
        {
          usuario: "Maria Santos",
          nota: 4,
          comentario: "Boa, mas poderia mais manjericão",
          data: new Date("2026-09-02")
        },
        {
          usuario: "Pedro Costa",
          nota: 5,
          comentario: "Excelente!",
          data: new Date("2026-09-03")
        }
      ]
    }
  }
)

// Query: Prato com avaliações
db.restaurantes_emb.aggregate([
  { $match: { _id: ObjectId("507f1f77bcf86cd799439001") } },
  { $unwind: "$pratos" },
  { $match: { "pratos.id_prato": 1 } }
])

// Problema: Adicionar mais avaliações é custoso
db.restaurantes_emb.updateOne(
  {
    _id: ObjectId("507f1f77bcf86cd799439001"),
    "pratos.id_prato": 1
  },
  {
    $push: {
      "pratos.0.avaliacoes": {
        usuario: "Ana Costa",
        nota: 4.5,
        comentario: "Muito bom",
        data: new Date()
      }
    }
  }
)

console.log("⚠️  EMBEDDED com muitas avaliações: arriscado")

// --- ABORDAGEM REFERENCE (recomendado) ---
db.avaliacoes.insertMany([
  {
    _id: ObjectId(),
    prato_id: ObjectId("prato_br_001"),
    usuario: "João Silva",
    nota: 5,
    comentario: "Feijoada impecável!",
    data: new Date("2026-09-01")
  },
  {
    _id: ObjectId(),
    prato_id: ObjectId("prato_br_001"),
    usuario: "Maria Santos",
    nota: 4,
    comentario: "Boa, mas poderia ter mais carne",
    data: new Date("2026-09-02")
  },
  {
    _id: ObjectId(),
    prato_id: ObjectId("prato_br_001"),
    usuario: "Pedro Costa",
    nota: 5,
    comentario: "Autêntica demais!",
    data: new Date("2026-09-03")
  },
  {
    _id: ObjectId(),
    prato_id: ObjectId("prato_br_002"),
    usuario: "Ana Costa",
    nota: 4.5,
    comentario: "Moqueca divina",
    data: new Date("2026-09-01")
  }
])

// Query: Avaliações de um prato
db.avaliacoes.find({ prato_id: ObjectId("prato_br_001") }).toArray()

// Query: Prato + avaliações
db.pratos.aggregate([
  { $match: { _id: ObjectId("prato_br_001") } },
  {
    $lookup: {
      from: "avaliacoes",
      localField: "_id",
      foreignField: "prato_id",
      as: "avaliacoes"
    }
  },
  {
    $addFields: {
      nota_media: { $avg: "$avaliacoes.nota" },
      total_avaliacoes: { $size: "$avaliacoes" }
    }
  }
])

// Query: Restaurante + Pratos + Avaliações (agregação complexa)
db.restaurantes_ref.aggregate([
  { $match: { _id: ObjectId("507f1f77bcf86cd799439002") } },
  {
    $lookup: {
      from: "pratos",
      localField: "_id",
      foreignField: "restaurante_id",
      as: "pratos"
    }
  },
  {
    $unwind: "$pratos"
  },
  {
    $lookup: {
      from: "avaliacoes",
      localField: "pratos._id",
      foreignField: "prato_id",
      as: "pratos.avaliacoes"
    }
  },
  {
    $group: {
      _id: "$_id",
      nome: { $first: "$nome" },
      pratos: {
        $push: {
          nome: "$pratos.nome",
          preco: "$pratos.preco",
          avaliacoes: "$pratos.avaliacoes",
          nota_media: { $avg: "$pratos.avaliacoes.nota" }
        }
      }
    }
  }
])

// Query: Top 3 avaliações de um prato
db.avaliacoes.find({ prato_id: ObjectId("prato_br_001") })
  .sort({ nota: -1 })
  .limit(3)
  .toArray()

// Adicionar nova avaliação (simples!)
db.avaliacoes.insertOne({
  prato_id: ObjectId("prato_br_001"),
  usuario: "Novo Usuário",
  nota: 5,
  comentario: "Perfeita!",
  data: new Date()
})

console.log("✅ REFERENCE com avaliações: escalável e simples")

// ============================================================================
// PARTE 5: EXEMPLO 4 - PEDIDO COM ITENS (Snapshot + Reference)
// ============================================================================

console.log("\n=== EXEMPLO 4: Pedido com Itens (Padrão Híbrido) ===")

const cliente_id = db.usuarios.findOne({ nome: "João Silva" })._id
const prato_margherita = db.pratos.findOne({ nome: "Margherita" })

// Inserir pedido com SNAPSHOT dos dados (para histórico)
db.pedidos.insertOne({
  _id: ObjectId(),
  cliente_id: cliente_id,  // REFERENCE
  
  // SNAPSHOT do cliente na época do pedido
  cliente_snapshot: {
    nome: "João Silva",
    email: "joao@example.com",
    endereco_entrega: "Av. Paulista, 1000"
  },
  
  // EMBEDDED dos itens (poucos, imutável)
  itens: [
    {
      prato_id: prato_margherita._id,
      nome: prato_margherita.nome,  // CÓPIA do nome
      preco: prato_margherita.preco,  // SNAPSHOT do preço
      quantidade: 2,
      subtotal: prato_margherita.preco * 2
    },
    {
      prato_id: ObjectId("prato_br_002"),
      nome: "Moqueca de Peixe",
      preco: 72.00,
      quantidade: 1,
      subtotal: 72.00
    }
  ],
  
  total: 164.00,
  data_pedido: new Date(),
  status: "entregue",
  data_entrega: new Date()
})

// Query: Pedido com itens
db.pedidos.findOne({})

// Query: Pedidos de um cliente
db.pedidos.find({ cliente_id: cliente_id }).toArray()

// Query: Histórico de preços (SNAPSHOT preserva preços históricos!)
db.pedidos.aggregate([
  { $match: { cliente_id: cliente_id } },
  { $unwind: "$itens" },
  {
    $group: {
      _id: "$itens.prato_id",
      nome: { $first: "$itens.nome" },
      precos_historicos: { $push: "$itens.preco" },
      quantidade_pedida: { $sum: "$itens.quantidade" }
    }
  }
])

// Query: Total gasto por cliente
db.pedidos.aggregate([
  { $match: { status: "entregue" } },
  {
    $group: {
      _id: "$cliente_id",
      total_gasto: { $sum: "$total" },
      quantidade_pedidos: { $sum: 1 }
    }
  },
  { $sort: { total_gasto: -1 } }
])

console.log("✅ HÍBRIDO: Reference + Embedded + Snapshot = flexível")

// ============================================================================
// PARTE 6: BENCHMARKS - Timing de Queries
// ============================================================================

console.log("\n=== BENCHMARKS: EMBEDDED vs REFERENCE ===")

// Inserir muitos pratos EMBEDDED (para teste)
db.restaurantes_emb.updateOne(
  { _id: ObjectId("507f1f77bcf86cd799439001") },
  {
    $set: {
      pratos: [
        ...Array(100).keys().map((i) => ({
          id_prato: i,
          nome: `Prato ${i}`,
          preco: 30 + i,
          tempo_preparo: 15 + (i % 10),
          ativo: true
        }))
      ]
    }
  }
)

// Benchmark 1: Buscar restaurante com pratos (EMBEDDED)
const start1 = Date.now()
for (let i = 0; i < 1000; i++) {
  db.restaurantes_emb.findOne({ _id: ObjectId("507f1f77bcf86cd799439001") })
}
const time1 = Date.now() - start1
console.log(`EMBEDDED (1000 queries): ${time1}ms`)

// Benchmark 2: Buscar pratos (REFERENCE)
const start2 = Date.now()
for (let i = 0; i < 1000; i++) {
  db.pratos.find({ restaurante_id: ObjectId("507f1f77bcf86cd799439002") }).toArray()
}
const time2 = Date.now() - start2
console.log(`REFERENCE (1000 queries): ${time2}ms`)

// ============================================================================
// PARTE 7: QUERIES COMUNS - Comparação
// ============================================================================

console.log("\n=== QUERIES COMUNS ===")

// 1. Listar todos os restaurantes com pratos
console.log("1. Todos restaurantes com pratos:")

console.log("EMBEDDED:")
db.restaurantes_emb.find({}).limit(1).toArray()

console.log("REFERENCE:")
db.restaurantes_ref.aggregate([
  {
    $lookup: {
      from: "pratos",
      localField: "_id",
      foreignField: "restaurante_id",
      as: "pratos"
    }
  }
]).limit(1).toArray()

// 2. Buscar pratos por faixa de preço
console.log("\n2. Pratos entre 40 e 70 reais:")

console.log("EMBEDDED:")
db.restaurantes_emb.aggregate([
  { $unwind: "$pratos" },
  { $match: { "pratos.preco": { $gte: 40, $lte: 70 } } }
]).toArray()

console.log("REFERENCE:")
db.pratos.find({ preco: { $gte: 40, $lte: 70 } }).toArray()

// 3. Contar avaliações
console.log("\n3. Contar avaliações por prato:")

console.log("REFERENCE:")
db.avaliacoes.aggregate([
  {
    $group: {
      _id: "$prato_id",
      total_avaliacoes: { $sum: 1 },
      nota_media: { $avg: "$nota" }
    }
  },
  { $sort: { total_avaliacoes: -1 } }
]).toArray()

// ============================================================================
// PARTE 8: CLEANUP
// ============================================================================

console.log("\n=== FIM DOS EXEMPLOS ===")
console.log("Para continuar com novos exemplos, use: db.*.deleteMany({})")
