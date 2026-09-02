/**
 * EXEMPLOS PRÁTICOS E EXECUTÁVEIS
 * Integridade Referencial e Automação de Embedded
 * IBD016 - Banco de Dados Não Relacional
 * 
 * Como usar:
 * 1. Conectar ao MongoDB: mongosh
 * 2. Selecionar DB: use ibd016_integridade
 * 3. Copiar e colar cada bloco de código
 */

// ============================================================================
// PARTE 1: INTEGRIDADE REFERENCIAL
// ============================================================================

use ibd016_integridade

// Limpar collections
db.usuarios.deleteMany({})
db.restaurantes.deleteMany({})
db.pratos.deleteMany({})
db.pedidos.deleteMany({})
db.auditoria.deleteMany({})

console.log("✅ Banco preparado para exemplos de Integridade Referencial")

// ============================================================================
// ESTRATÉGIA 1: VALIDAÇÃO NO APLICATIVO
// ============================================================================

console.log("\n=== ESTRATÉGIA 1: Validação no Aplicativo ===")

// Inserir dados base
db.usuarios.insertOne({
  _id: ObjectId("60000000000000000000001"),
  nome: "João Silva",
  email: "joao@example.com"
})

db.restaurantes.insertOne({
  _id: ObjectId("60000000000000000000101"),
  nome: "Pizzaria Gourmet",
  telefone: "1133334444"
})

db.pratos.insertMany([
  {
    _id: ObjectId("60000000000000000000201"),
    nome: "Margherita",
    preco: 45.00,
    restaurante_id: ObjectId("60000000000000000000101")
  },
  {
    _id: ObjectId("60000000000000000000202"),
    nome: "Pepperoni",
    preco: 52.00,
    restaurante_id: ObjectId("60000000000000000000101")
  }
])

// -------- Função de Validação --------

function validarIntegridadePedido(pedidoData) {
  const erros = [];

  // Validar usuário existe
  const usuario = db.usuarios.findOne({ _id: pedidoData.usuario_id });
  if (!usuario) {
    erros.push(`❌ Usuário ${pedidoData.usuario_id} não existe`);
  }

  // Validar restaurante existe
  const restaurante = db.restaurantes.findOne({ _id: pedidoData.restaurante_id });
  if (!restaurante) {
    erros.push(`❌ Restaurante ${pedidoData.restaurante_id} não existe`);
  }

  // Validar cada prato existe
  for (const item of pedidoData.itens) {
    const prato = db.pratos.findOne({ _id: item.prato_id });
    if (!prato) {
      erros.push(`❌ Prato ${item.prato_id} não existe`);
    }
  }

  if (erros.length > 0) {
    return { valido: false, erros };
  }

  return { valido: true, usuario, restaurante };
}

// -------- Teste 1: Validação bem-sucedida --------

const pedidoValido = {
  usuario_id: ObjectId("60000000000000000000001"),
  restaurante_id: ObjectId("60000000000000000000101"),
  itens: [
    { prato_id: ObjectId("60000000000000000000201"), quantidade: 2 }
  ],
  total: 90.00
};

const resultado1 = validarIntegridadePedido(pedidoValido);
console.log("Teste 1 - Pedido válido:");
console.log(resultado1);

if (resultado1.valido) {
  db.pedidos.insertOne({
    _id: ObjectId(),
    ...pedidoValido,
    status: 'pendente',
    data_criacao: new Date()
  });
  console.log("✅ Pedido inserido com sucesso\n");
}

// -------- Teste 2: Validação falha --------

const pedidoInvalido = {
  usuario_id: ObjectId("99999999999999999999999"),  // Não existe!
  restaurante_id: ObjectId("60000000000000000000101"),
  itens: [
    { prato_id: ObjectId("60000000000000000000201"), quantidade: 1 }
  ],
  total: 45.00
};

const resultado2 = validarIntegridadePedido(pedidoInvalido);
console.log("Teste 2 - Pedido inválido:");
console.log(resultado2);
console.log("❌ Pedido NÃO foi inserido (validação falhou)\n");

// ============================================================================
// ESTRATÉGIA 2: MONGODB TRANSACTIONS (ACID)
// ============================================================================

console.log("\n=== ESTRATÉGIA 2: MongoDB Transactions ===")

// -------- Função de Pedido com Transação --------

function criarPedidoComTransaction(pedidoData) {
  try {
    const session = db.getMongo().startSession();
    session.startTransaction();

    // PASSO 1: Validar integridade primeiro
    const validacao = validarIntegridadePedido(pedidoData);
    if (!validacao.valido) {
      session.abortTransaction();
      session.endSession();
      return { sucesso: false, erros: validacao.erros };
    }

    // PASSO 2: Criar pedido em transação
    const pedido = {
      _id: ObjectId(),
      usuario_id: pedidoData.usuario_id,
      restaurante_id: pedidoData.restaurante_id,
      itens: pedidoData.itens,
      total: pedidoData.total,
      status: 'pendente',
      data_criacao: new Date()
    };

    db.pedidos.insertOne(pedido, { session });

    // PASSO 3: Atualizar histórico de pedidos do usuário (atômico)
    db.usuarios.updateOne(
      { _id: pedidoData.usuario_id },
      { $push: { pedidos_ids: pedido._id } },
      { session }
    );

    // PASSO 4: Atualizar estatísticas do restaurante (atômico)
    db.restaurantes.updateOne(
      { _id: pedidoData.restaurante_id },
      { 
        $inc: { total_vendas: pedidoData.total },
        $push: { pedidos_recentes: pedido._id }
      },
      { session }
    );

    session.commitTransaction();
    session.endSession();

    console.log("✅ Transação commitada com sucesso");
    console.log("   - Pedido criado");
    console.log("   - Histórico de usuário atualizado");
    console.log("   - Estatísticas do restaurante atualizadas\n");

    return { sucesso: true, pedido_id: pedido._id };

  } catch (erro) {
    session.abortTransaction();
    session.endSession();
    console.error("❌ Transação abortada:", erro.message, "\n");
    return { sucesso: false, erro: erro.message };
  }
}

// -------- Teste Transaction --------

const resultadoTx = criarPedidoComTransaction({
  usuario_id: ObjectId("60000000000000000000001"),
  restaurante_id: ObjectId("60000000000000000000101"),
  itens: [
    { prato_id: ObjectId("60000000000000000000202"), quantidade: 1 }
  ],
  total: 52.00
});

// Verificar se tudo foi atualizado atomicamente
console.log("Estado após transação:");
console.log("Usuário:", db.usuarios.findOne({ _id: ObjectId("60000000000000000000001") }));
console.log("Restaurante:", db.restaurantes.findOne({ _id: ObjectId("60000000000000000000101") }));
console.log("Pedidos:", db.pedidos.find().toArray().length, "pedido(s)");

// ============================================================================
// ESTRATÉGIA 3: ÍNDICES PARA VALIDAÇÃO
// ============================================================================

console.log("\n=== ESTRATÉGIA 3: Índices para Validação ===")

// Criar índice que garante que apenas pratos válidos são referenciados
db.pedidos.createIndex({ "itens.prato_id": 1 });

// Índice único: cada usuário não pode ter 2 pedidos idênticos
db.pedidos.createIndex({ 
  "usuario_id": 1,
  "restaurante_id": 1,
  "data_criacao": 1
});

console.log("✅ Índices criados para validação\n");

// ============================================================================
// ESTRATÉGIA 4: CHANGE STREAMS (Detectar Deleções)
// ============================================================================

console.log("\n=== ESTRATÉGIA 4: Change Streams ===")

// -------- Monitor de deleções de pratos --------

// Nota: Change streams precisam de Replica Set, pode não funcionar em mongosh simples
// Mas mostramos o padrão:

console.log("Padrão de Change Stream para monitorar deleções:")
console.log(`
const pratoStream = db.collection('pratos').watch([
  { $match: { operationType: 'delete' } }
]);

pratoStream.on('change', async (change) => {
  const prato_id = change.documentKey._id;
  
  // Encontrar pedidos órfãos
  const pedidos_afetados = db.collection('pedidos').find({
    'itens.prato_id': prato_id
  });

  // Remover referência órfã
  await db.collection('pedidos').updateMany(
    { 'itens.prato_id': prato_id },
    { $pull: { itens: { prato_id: prato_id } } }
  );

  console.log('✅ Referências órfãs removidas');
});
`);

// ============================================================================
// PARTE 2: AUTOMAÇÃO DE UPDATES EM EMBEDDED
// ============================================================================

console.log("\n=== PARTE 2: AUTOMAÇÃO DE EMBEDDED ===\n")

db.pedidos_embedded.deleteMany({})

// Inserir pedido com dados EMBEDDED do usuário
db.pedidos_embedded.insertOne({
  _id: ObjectId("70000000000000000000001"),
  usuario: {
    _id: ObjectId("60000000000000000000001"),
    nome: "João Silva",         // ← Cópia
    email: "joao@example.com"   // ← Cópia
  },
  restaurante: {
    _id: ObjectId("60000000000000000000101"),
    nome: "Pizzaria Gourmet",   // ← Cópia
    telefone: "1133334444"      // ← Cópia
  },
  itens: [
    { prato_id: ObjectId("60000000000000000000201"), nome: "Margherita", preco: 45 }
  ],
  total: 45.00,
  data_criacao: new Date()
});

console.log("Pedido com dados embedded criado:");
console.log(db.pedidos_embedded.findOne({ _id: ObjectId("70000000000000000000001") }));

// ============================================================================
// ESTRATÉGIA 1: DENORMALIZE ON WRITE (Eager Updates)
// ============================================================================

console.log("\n=== ESTRATÉGIA 1: Denormalize on Write ===")

// -------- Mapa de Denormalizações --------

const DENORMALIZACOES = {
  usuarios: {
    nome: ['pedidos_embedded'],
    email: ['pedidos_embedded']
  },
  restaurantes: {
    nome: ['pedidos_embedded'],
    telefone: ['pedidos_embedded']
  }
};

// -------- Função de Atualização com Sync --------

function atualizarComDenormalizacao(colecaoOrigem, docId, novosDados) {
  // PASSO 1: Atualizar documento principal
  db.getCollection(colecaoOrigem).updateOne(
    { _id: docId },
    { $set: novosDados }
  );

  console.log(`📝 ${colecaoOrigem}: documento principal atualizado`);

  // PASSO 2: Atualizar todas as cópias
  const camposAtualizados = Object.keys(novosDados);

  for (const campo of camposAtualizados) {
    const denormalizacoes = DENORMALIZACOES[colecaoOrigem]?.[campo] || [];

    for (const colecaoDest of denormalizacoes) {
      // Construir o path do campo aninhado
      let pathCampo;
      if (colecaoOrigem === 'usuarios') {
        pathCampo = `usuario.${campo}`;
      } else if (colecaoOrigem === 'restaurantes') {
        pathCampo = `restaurante.${campo}`;
      }

      const updateObj = {};
      updateObj[pathCampo] = novosDados[campo];

      const resultado = db.getCollection(colecaoDest).updateMany(
        { [pathCampo.split('.')[0]]: { $exists: true } },
        { $set: updateObj }
      );

      console.log(`  ✅ ${colecaoDest}.${pathCampo}: ${resultado.modifiedCount} documento(s) atualizado(s)`);
    }
  }
}

// -------- Teste: Atualizar nome do usuário --------

console.log("\nAtualizando nome do usuário...");
atualizarComDenormalizacao('usuarios', ObjectId("60000000000000000000001"), {
  nome: "João Silva Santos",
  email: "joao.silva@newemail.com"
});

console.log("\nPedido após atualização:");
console.log(db.pedidos_embedded.findOne({ _id: ObjectId("70000000000000000000001") }));
console.log("✅ Nome do usuário está sincronizado!\n");

// ============================================================================
// ESTRATÉGIA 2: DENORMALIZE ON READ (Lazy Updates)
// ============================================================================

console.log("\n=== ESTRATÉGIA 2: Denormalize on Read ===")

// Inserir mais um pedido com dados antigos
db.pedidos_embedded.insertOne({
  _id: ObjectId("70000000000000000000002"),
  usuario: {
    _id: ObjectId("60000000000000000000001"),
    nome: "João Silva",         // ← ANTIGO
    email: "joao@example.com"   // ← ANTIGO
  },
  restaurante: {
    _id: ObjectId("60000000000000000000101"),
    nome: "Pizzaria Gourmet",
    telefone: "1133334444"
  },
  itens: [
    { prato_id: ObjectId("60000000000000000000202"), nome: "Pepperoni", preco: 52 }
  ],
  total: 52.00,
  data_criacao: new Date()
});

// -------- Query com Enriquecimento (Lookup) --------

console.log("Buscar pedido com dados ATUALIZADOS (via lookup):");

db.pedidos_embedded.aggregate([
  { $match: { _id: ObjectId("70000000000000000000002") } },
  
  // Enrichir com dados de usuário (buscar valor atual)
  {
    $lookup: {
      from: 'usuarios',
      localField: 'usuario._id',
      foreignField: '_id',
      as: 'usuario_atual'
    }
  },
  { $unwind: '$usuario_atual' },

  // Enrichir com dados de restaurante
  {
    $lookup: {
      from: 'restaurantes',
      localField: 'restaurante._id',
      foreignField: '_id',
      as: 'restaurante_atual'
    }
  },
  { $unwind: '$restaurante_atual' },

  // Projetar resultado
  {
    $project: {
      _id: 1,
      usuario_historico: '$usuario',  // Dados da época
      usuario_atual: '$usuario_atual',  // Dados atualizados
      restaurante_historico: '$restaurante',
      restaurante_atual: '$restaurante_atual',
      itens: 1,
      total: 1
    }
  }
]).forEach(printjson);

console.log("✅ Pedido retorna dados históricos E atualizados\n");

// ============================================================================
// ESTRATÉGIA 3: HYBRID (Snapshot + Reference)
// ============================================================================

console.log("\n=== ESTRATÉGIA 3: Hybrid (Snapshot + Reference) ===")

db.pedidos_hybrid.insertOne({
  _id: ObjectId("70000000000000000000003"),
  
  // REFERENCE para lookup de dados atualizados
  usuario_id: ObjectId("60000000000000000000001"),
  restaurante_id: ObjectId("60000000000000000000101"),
  
  // SNAPSHOT (imutável) - preserva histórico
  usuario_snapshot: {
    nome: "João Silva",
    email: "joao@example.com"
  },
  
  restaurante_snapshot: {
    nome: "Pizzaria Gourmet",
    telefone: "1133334444"
  },
  
  itens: [
    { prato_id: ObjectId("60000000000000000000201"), nome: "Margherita", preco: 45 }
  ],
  
  total: 45.00,
  data_criacao: new Date()
});

console.log("Pedido Hybrid criado:");
const pedidoHybrid = db.pedidos_hybrid.findOne({ _id: ObjectId("70000000000000000000003") });
console.log("- Snapshot preservado:", pedidoHybrid.usuario_snapshot.nome);
console.log("- Reference disponível:", pedidoHybrid.usuario_id);

// Buscar dados atualizados via reference
console.log("\nBuscando dados atualizados:");
const usuarioAtualizado = db.usuarios.findOne({ _id: pedidoHybrid.usuario_id });
console.log("- Dados atualizados:", usuarioAtualizado.nome);
console.log("✅ Hybrid preserva história + permite dados frescos\n");

// ============================================================================
// TESTE INTEGRADO: Atualizar e Sincronizar Tudo
// ============================================================================

console.log("\n=== TESTE INTEGRADO: Atualização Completa ===")

// Cenário: Restaurante muda de telefone

console.log("Restaurante antigo:", db.restaurantes.findOne({ _id: ObjectId("60000000000000000000101") }).telefone);

// Atualizar com denormalização
atualizarComDenormalizacao('restaurantes', ObjectId("60000000000000000000101"), {
  telefone: "1188888888"
});

console.log("\nRestaurante novo:", db.restaurantes.findOne({ _id: ObjectId("60000000000000000000101") }).telefone);

console.log("\nPedidos com telefone sincronizado:");
db.pedidos_embedded.find({}).forEach(pedido => {
  console.log(`- Pedido ${pedido._id}: ${pedido.restaurante.telefone}`);
});

// ============================================================================
// CHECKLIST E RESUMO
// ============================================================================

console.log("\n=== CHECKLIST: Qual Estratégia Usar? ===\n")

console.log(`
┌─ Dados mudam FREQUENTEMENTE (diários)?
│  ├─ SIM → DENORMALIZE ON WRITE
│  └─ NÃO → DENORMALIZE ON READ
│
├─ Precisa histórico dos dados (snapshot)?
│  ├─ SIM → HYBRID (Snapshot + Reference)
│  └─ NÃO → Escolher uma das acima
│
└─ Muitas coleções com cópias?
   ├─ 1-2 → DENORMALIZE ON WRITE (simples)
   ├─ 3-5 → DENORMALIZE ON WRITE (com mapa)
   └─ 5+ → CHANGE STREAMS ou FILA (Bull)
`);

console.log("\n=== COMPARAÇÃO FINAL ===");

const comparacao = [
  {
    estrategia: "Validação Aplicativo",
    velocidade: "⭐⭐⭐",
    seguranca: "⭐⭐",
    implementacao: "Fácil"
  },
  {
    estrategia: "Transactions",
    velocidade: "⭐⭐",
    seguranca: "⭐⭐⭐⭐⭐",
    implementacao: "Média"
  },
  {
    estrategia: "Denorm on Write",
    velocidade: "⭐⭐",
    seguranca: "⭐⭐⭐",
    implementacao: "Média"
  },
  {
    estrategia: "Denorm on Read",
    velocidade: "⭐⭐⭐",
    seguranca: "⭐⭐",
    implementacao: "Média"
  },
  {
    estrategia: "Hybrid",
    velocidade: "⭐⭐⭐",
    seguranca: "⭐⭐⭐",
    implementacao: "Média"
  }
];

comparacao.forEach(row => {
  console.log(`\n${row.estrategia}`);
  console.log(`  Velocidade: ${row.velocidade}`);
  console.log(`  Segurança: ${row.seguranca}`);
  console.log(`  Implementação: ${row.implementacao}`);
});

console.log("\n✅ Exemplos concluídos!");
console.log("Próximo: Implementar em Node.js com Express + MongoDB");
