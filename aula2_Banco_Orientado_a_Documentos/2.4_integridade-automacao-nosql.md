# Integridade Referencial e Automação em NoSQL

**IBD016 - Banco de Dados Não Relacional**  
**Tópicos Avançados: Consistência e Sincronização de Dados**

---

## PARTE 1: INTEGRIDADE REFERENCIAL EM NoSQL

### 1.1 O Problema: MongoDB NÃO tem Foreign Keys

Diferente de bancos relacionais, MongoDB **NÃO garante referential integrity automaticamente**:

```javascript
// ❌ PROBLEMA: MongoDB permite isso
db.pedidos.insertOne({
  _id: 1,
  prato_id: ObjectId("inexistente"),  // Prato não existe!
  quantidade: 2
})

db.pratos.deleteOne({ _id: ObjectId("inexistente") })
// Pedido fica órfão, ninguém avisa!
```

**Em SQL (PostgreSQL):**
```sql
CREATE TABLE pedidos (
  id INT PRIMARY KEY,
  prato_id INT REFERENCES pratos(id)  -- Garante existência
);

-- ❌ Isto FALHA (garante integridade)
INSERT INTO pedidos VALUES (1, 999);  -- prato_id 999 não existe
```

---

### 1.2 Estratégia 1: Validação no Aplicativo (Application-Level)

**Ideia:** Antes de inserir/atualizar, verificar se referência existe.

#### 1.2.1 Implementação em JavaScript/Node.js

```javascript
// ============================================================
// Validador de Integridade Referencial
// ============================================================

const mongodb = require('mongodb');
const { MongoClient, ObjectId } = mongodb;

class IntridadeReferencial {
  constructor(db) {
    this.db = db;
  }

  // Validar se prato existe
  async validarPratoExiste(prato_id) {
    const prato = await this.db.collection('pratos').findOne({
      _id: ObjectId(prato_id)
    });

    if (!prato) {
      throw new Error(`Prato ${prato_id} não existe!`);
    }
    return prato;
  }

  // Validar se usuário existe
  async validarUsuarioExiste(usuario_id) {
    const usuario = await this.db.collection('usuarios').findOne({
      _id: ObjectId(usuario_id)
    });

    if (!usuario) {
      throw new Error(`Usuário ${usuario_id} não existe!`);
    }
    return usuario;
  }

  // Validar se restaurante existe
  async validarRestauranteExiste(restaurante_id) {
    const restaurante = await this.db.collection('restaurantes').findOne({
      _id: ObjectId(restaurante_id)
    });

    if (!restaurante) {
      throw new Error(`Restaurante ${restaurante_id} não existe!`);
    }
    return restaurante;
  }

  // Validar integridade de um pedido completo
  async validarIntegridadePedido(pedido) {
    try {
      // Validar usuário
      const usuario = await this.validarUsuarioExiste(pedido.usuario_id);

      // Validar restaurante
      const restaurante = await this.validarRestauranteExiste(pedido.restaurante_id);

      // Validar cada item (prato)
      for (const item of pedido.itens) {
        await this.validarPratoExiste(item.prato_id);
      }

      return {
        valido: true,
        usuario,
        restaurante,
        mensagem: 'Integridade referencial OK'
      };
    } catch (erro) {
      return {
        valido: false,
        erro: erro.message
      };
    }
  }
}

// ============================================================
// USO PRÁTICO
// ============================================================

async function criarPedido(db, pedidoData) {
  const validador = new IntridadeReferencial(db);

  // PASSO 1: Validar integridade
  const validacao = await validador.validarIntegridadePedido(pedidoData);

  if (!validacao.valido) {
    console.error('❌ Pedido inválido:', validacao.erro);
    return null;
  }

  // PASSO 2: Se passou na validação, inserir
  const pedido = {
    _id: new ObjectId(),
    usuario_id: pedidoData.usuario_id,
    restaurante_id: pedidoData.restaurante_id,
    itens: pedidoData.itens,
    total: pedidoData.total,
    status: 'pendente',
    data_criacao: new Date()
  };

  const resultado = await db.collection('pedidos').insertOne(pedido);

  console.log('✅ Pedido criado com ID:', resultado.insertedId);
  return pedido;
}

// Exemplo de uso
const pedidoValido = {
  usuario_id: ObjectId("607f1f77bcf86cd799439011"),
  restaurante_id: ObjectId("607f1f77bcf86cd799439021"),
  itens: [
    { prato_id: ObjectId("607f1f77bcf86cd799439031"), quantidade: 2 }
  ],
  total: 90.00
};

// await criarPedido(db, pedidoValido);  // ✅ Funciona se IDs existem
```

---

#### 1.2.2 Validação em Mongoose (ODM para Node.js)

Mongoose oferece **validação schema** built-in:

```javascript
const mongoose = require('mongoose');

// ============================================================
// Esquema com Validação de Integridade
// ============================================================

const pratoSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  nome: { type: String, required: true },
  preco: { type: Number, required: true, min: 0 },
  restaurante_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurante',  // Reference ao modelo Restaurante
    required: true,
    // Validador customizado
    validate: {
      async: true,
      validator: async function(restaurante_id) {
        const restaurante = await mongoose.model('Restaurante')
          .findById(restaurante_id);
        return restaurante !== null;  // true = válido
      },
      message: 'Restaurante não existe'
    }
  }
});

const Prato = mongoose.model('Prato', pratoSchema);

// Schema de Pedido
const pedidoSchema = new mongoose.Schema({
  usuario_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
    validate: {
      async: true,
      validator: async function(usuario_id) {
        const usuario = await mongoose.model('Usuario')
          .findById(usuario_id);
        return usuario !== null;
      },
      message: 'Usuário não existe'
    }
  },
  restaurante_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurante',
    required: true,
    validate: {
      async: true,
      validator: async function(restaurante_id) {
        const restaurante = await mongoose.model('Restaurante')
          .findById(restaurante_id);
        return restaurante !== null;
      },
      message: 'Restaurante não existe'
    }
  },
  itens: [{
    prato_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prato',
      required: true
    },
    quantidade: { type: Number, min: 1 }
  }]
});

const Pedido = mongoose.model('Pedido', pedidoSchema);

// ============================================================
// USO: Validação automática
// ============================================================

try {
  const novoPedido = await Pedido.create({
    usuario_id: ObjectId("valid_user_id"),
    restaurante_id: ObjectId("valid_restaurant_id"),
    itens: [
      { prato_id: ObjectId("valid_prato_id"), quantidade: 2 }
    ]
  });

  console.log('✅ Pedido criado:', novoPedido._id);
} catch (erro) {
  // ❌ Validação falhou
  console.error('Erro de integridade:', erro.message);
}
```

---

### 1.3 Estratégia 2: MongoDB Transactions (ACID)

**Para operações críticas que precisam de múltiplas coleções consistentes:**

#### 1.3.1 Transaction básica

```javascript
const session = db.getMongo().startSession();

try {
  session.startTransaction();

  // ============================================================
  // OPERAÇÃO 1: Criar pedido
  // ============================================================
  const pedido = {
    _id: ObjectId(),
    usuario_id: ObjectId("user_123"),
    total: 100,
    status: 'pendente'
  };

  await db.collection('pedidos').insertOne(pedido, { session });

  // ============================================================
  // OPERAÇÃO 2: Atualizar estoque do prato (atomicamente)
  // ============================================================
  const resultado = await db.collection('pratos').updateOne(
    { _id: ObjectId("prato_456") },
    { $inc: { estoque: -2 } },  // Subtrair 2 unidades
    { session }
  );

  if (resultado.modifiedCount === 0) {
    throw new Error('Prato não encontrado - impossível atualizar estoque');
  }

  // ============================================================
  // OPERAÇÃO 3: Atualizar saldo do usuário
  // ============================================================
  await db.collection('usuarios').updateOne(
    { _id: ObjectId("user_123") },
    { $inc: { saldo: -100 } },
    { session }
  );

  // ✅ Se chegou aqui, COMMITAR (todas as operações acontecem)
  session.commitTransaction();
  console.log('✅ Transaction commitada com sucesso');

} catch (erro) {
  // ❌ Se erro em qualquer passo, REVERTER (rollback tudo)
  session.abortTransaction();
  console.error('❌ Transaction abortada:', erro.message);
  
} finally {
  session.endSession();
}
```

**Vantagem:** Garante que **ou tudo acontece ou nada acontece**.

---

#### 1.3.2 Transaction em Node.js com Mongoose

```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // Criar pedido
  const pedido = await Pedido.create([{
    usuario_id: userId,
    restaurante_id: restauranteId,
    itens: itens,
    total: total
  }], { session });

  // Atualizar histórico do usuário
  await Usuario.updateOne(
    { _id: userId },
    { $push: { pedidos_ids: pedido[0]._id } },
    { session }
  );

  // Atualizar estatísticas do restaurante
  await Restaurante.updateOne(
    { _id: restauranteId },
    { 
      $inc: { total_vendas: total },
      $push: { pedidos_recentes: pedido[0]._id }
    },
    { session }
  );

  await session.commitTransaction();
  console.log('✅ Transaction bem-sucedida');

} catch (erro) {
  await session.abortTransaction();
  console.error('❌ Erro na transaction:', erro.message);
  
} finally {
  await session.endSession();
}
```

---

### 1.4 Estratégia 3: Change Streams (Monitoramento em Tempo Real)

**Para detectar e reagir a deleções/atualizações:**

```javascript
// ============================================================
// Monitorar deleções de pratos
// ============================================================

const pratosPipeline = [
  { $match: { operationType: 'delete' } }  // Apenas deleções
];

const stream = db.collection('pratos').watch(pratosPipeline);

stream.on('change', async (change) => {
  console.log('⚠️  Prato deletado:', change.documentKey._id);

  // AÇÃO: Encontrar e remover referências órfãs
  const prato_id = change.documentKey._id;

  // Encontrar pedidos com este prato
  const pedidos_afetados = await db.collection('pedidos').find({
    'itens.prato_id': prato_id
  }).toArray();

  console.log(`🔍 ${pedidos_afetados.length} pedidos contêm este prato`);

  // Opção 1: Remover item do pedido
  await db.collection('pedidos').updateMany(
    { 'itens.prato_id': prato_id },
    { $pull: { itens: { prato_id: prato_id } } }
  );

  console.log('✅ Referências órfãs removidas');
});

// Quando não precisar mais
// stream.close();
```

---

### 1.5 Estratégia 4: Foreign Key Simulada (Índice Único)

Para casos onde você quer garantir que apenas IDs válidos sejam usados:

```javascript
// ============================================================
// Criar índices para validação
// ============================================================

// Índice único: garante que cada item de pedido referencia um prato único
db.collection('pedidos').createIndex({
  "itens.prato_id": 1
});

// Índice compound: usuário não pode ter dois pedidos iguais
db.collection('pedidos').createIndex({
  "usuario_id": 1,
  "restaurante_id": 1,
  "data_criacao": 1
}, { unique: false });

// ============================================================
// Lookup com validação (agregação)
// ============================================================

db.collection('pedidos').aggregate([
  {
    $lookup: {
      from: "pratos",
      localField: "itens.prato_id",
      foreignField: "_id",
      as: "itens_validados"
    }
  },
  {
    // Filtrar: apenas items que encontraram correspondência
    $match: {
      $expr: { 
        $eq: [
          { $size: "$itens" },
          { $size: "$itens_validados" }
        ]
      }
    }
  }
]).toArray();

// Resultado: apenas pedidos onde TODOS os pratos existem
```

---

### 1.6 Checklist: Estratégia de Integridade Referencial

Escolha a melhor para seu caso:

| Estratégia | Complexidade | Performance | Segurança | Melhor Para |
|-----------|:---:|:---:|:---:|---|
| **Application-Level** | Baixa | Alta | ⚠️ Média | Aplicações simples |
| **Mongoose Validation** | Média | Média | ✅ Alta | Node.js apps |
| **MongoDB Transactions** | Alta | Média | ✅ Muito Alta | Operações críticas |
| **Change Streams** | Alta | Baixa | ✅ Alta | Limpeza assíncrona |
| **Índices** | Baixa | Alta | ⚠️ Média | Queries rápidas |

---

## PARTE 2: AUTOMAÇÃO DE UPDATES EM DADOS EMBEDDED

### 2.1 O Problema: Dados Duplicados Ficam Desatualizados

```javascript
// PROBLEMA: Nome do usuário em MÚLTIPLOS documentos
db.pedidos.insertMany([
  {
    _id: 1,
    usuario: {
      _id: 100,
      nome: "João Silva",  // ← Cópia
      email: "joao@email.com"
    },
    total: 100
  },
  {
    _id: 2,
    usuario: {
      _id: 100,
      nome: "João Silva",  // ← Cópia
      email: "joao@email.com"
    },
    total: 200
  }
]);

// Usuário muda nome em usuarios collection:
db.usuarios.updateOne(
  { _id: 100 },
  { $set: { nome: "João S. Silva" } }
);

// ❌ INCONSISTÊNCIA: Pedidos ainda têm nome antigo!
```

---

### 2.2 Estratégia 1: Denormalize on Write (Eager Updates)

**Ideia:** Quando dados principais mudam, atualizar TODAS as cópias imediatamente.

#### 2.2.1 Implementação Manual

```javascript
// ============================================================
// Atualizar nome do usuário e todas as cópias
// ============================================================

async function atualizarUsuario(db, usuario_id, novosDados) {
  // PASSO 1: Atualizar documento principal
  await db.collection('usuarios').updateOne(
    { _id: usuario_id },
    { $set: novosDados }
  );

  // PASSO 2: Atualizar TODAS as cópias em pedidos
  if (novosDados.nome) {
    await db.collection('pedidos').updateMany(
      { "usuario.id": usuario_id },
      { $set: { "usuario.nome": novosDados.nome } }
    );
  }

  // PASSO 3: Atualizar TODAS as cópias em comentarios
  if (novosDados.nome) {
    await db.collection('comentarios').updateMany(
      { "autor.id": usuario_id },
      { $set: { "autor.nome": novosDados.nome } }
    );
  }

  // PASSO 4: Atualizar TODAS as cópias em avaliacoes
  if (novosDados.nome) {
    await db.collection('avaliacoes').updateMany(
      { "usuario.id": usuario_id },
      { $set: { "usuario.nome": novosDados.nome } }
    );
  }

  console.log('✅ Usuário e todas as cópias atualizadas');
}

// ============================================================
// USO
// ============================================================

await atualizarUsuario(db, 100, {
  nome: "João Silva Santos",
  email: "joao.silva@newmail.com"
});
```

**Problema:** Precisa listar manualmente TODAS as coleções que contêm cópias.

**Solução:** Usar mapa de denormalizações!

---

#### 2.2.2 Uso de Mapa de Denormalizações (Melhor)

```javascript
// ============================================================
// Mapa: Qual dado está duplicado aonde?
// ============================================================

const DENORMALIZACOES = {
  usuarios: {
    // Se campo 'nome' em usuarios mudar,
    // atualizar 'nome' em:
    nome: [
      { colecao: 'pedidos', campo: 'usuario.nome' },
      { colecao: 'comentarios', campo: 'autor.nome' },
      { colecao: 'avaliacoes', campo: 'usuario.nome' },
      { colecao: 'posts', campo: 'autor.nome' }
    ],

    email: [
      { colecao: 'pedidos', campo: 'usuario.email' },
      { colecao: 'comentarios', campo: 'autor.email' }
    ],

    avatar_url: [
      { colecao: 'pedidos', campo: 'usuario.avatar_url' },
      { colecao: 'comentarios', campo: 'autor.avatar_url' },
      { colecao: 'posts', campo: 'autor.avatar_url' }
    ]
  },

  restaurantes: {
    nome: [
      { colecao: 'pedidos', campo: 'restaurante.nome' },
      { colecao: 'pratos', campo: 'restaurante.nome' }
    ],

    telefone: [
      { colecao: 'pedidos', campo: 'restaurante.telefone' }
    ]
  }
};

// ============================================================
// Função genérica de atualização
// ============================================================

async function atualizarComDenormalizacao(db, colecaoOrigem, docId, novosDados) {
  // PASSO 1: Atualizar documento original
  await db.collection(colecaoOrigem).updateOne(
    { _id: docId },
    { $set: novosDados }
  );

  // PASSO 2: Encontrar quais campos foram atualizados
  const camposAtualizados = Object.keys(novosDados);

  // PASSO 3: Para cada campo atualizado, atualizar todas as cópias
  for (const campo of camposAtualizados) {
    const denormalizacoes = DENORMALIZACOES[colecaoOrigem]?.[campo] || [];

    for (const den of denormalizacoes) {
      // Construir path completo (ex: "usuario.nome")
      const pathCompleto = den.campo;

      await db.collection(den.colecao).updateMany(
        // Match: encontrar documentos com a cópia
        { [pathCompleto.split('.')[0]]: { $exists: true } },
        // Update: atualizar apenas esse campo
        { $set: { [pathCompleto]: novosDados[campo] } }
      );

      console.log(`  ✅ Atualizado: ${den.colecao}.${den.campo}`);
    }
  }

  console.log(`✅ ${camposAtualizados.length} campo(s) sincronizado(s) em todas as cópiasрок`);
}

// ============================================================
// USO
// ============================================================

await atualizarComDenormalizacao(db, 'usuarios', 100, {
  nome: "João Silva Santos",
  avatar_url: "https://new-avatar.jpg"
});

// Resultado automático:
// ✅ Atualizado: pedidos.usuario.nome
// ✅ Atualizado: pedidos.usuario.avatar_url
// ✅ Atualizado: comentarios.autor.nome
// ✅ Atualizado: comentarios.autor.avatar_url
// ✅ Atualizado: avaliacoes.usuario.nome
// ✅ Atualizado: posts.autor.nome
// ...
```

**Vantagem:** Centralizado, escalável, fácil adicionar novas denormalizações.

---

### 2.3 Estratégia 2: Denormalize on Read (Lazy Updates)

**Ideia:** Não sincronizar imediatamente. Buscar dados atualizados ao ler.

#### 2.3.1 Implementação com Agregação

```javascript
// ============================================================
// Query que enriquece dados embedded com valores atuais
// ============================================================

async function buscarPedidoComDadosAtualizados(db, pedido_id) {
  // PASSO 1: Buscar pedido
  const pedido = await db.collection('pedidos').findOne({
    _id: pedido_id
  });

  // PASSO 2: Buscar usuário atualizado
  const usuario_atualizado = await db.collection('usuarios').findOne({
    _id: pedido.usuario.id
  });

  // PASSO 3: Buscar restaurante atualizado
  const restaurante_atualizado = await db.collection('restaurantes').findOne({
    _id: pedido.restaurante.id
  });

  // PASSO 4: Mesclar dados
  return {
    ...pedido,
    usuario: usuario_atualizado,      // Valores atualizados
    restaurante: restaurante_atualizado // Valores atualizados
  };
}

// Alternativa: Usar agregação (mais eficiente)
async function buscarPedidoComLookup(db, pedido_id) {
  return await db.collection('pedidos').aggregate([
    { $match: { _id: pedido_id } },
    
    // Enrichir com dados de usuário (atualizados)
    {
      $lookup: {
        from: 'usuarios',
        localField: 'usuario.id',
        foreignField: '_id',
        as: 'usuario_atual'
      }
    },
    { $unwind: '$usuario_atual' },

    // Enrichir com dados de restaurante (atualizados)
    {
      $lookup: {
        from: 'restaurantes',
        localField: 'restaurante.id',
        foreignField: '_id',
        as: 'restaurante_atual'
      }
    },
    { $unwind: '$restaurante_atual' },

    // Projetar resultado final
    {
      $project: {
        _id: 1,
        usuario: '$usuario_atual',
        restaurante: '$restaurante_atual',
        itens: 1,
        total: 1
      }
    }
  ]).toArray();
}

// ============================================================
// USO
// ============================================================

const pedido = await buscarPedidoComLookup(db, ObjectId("pedido_123"));
console.log(pedido);
// Resultado sempre tem dados ATUALIZADOS de usuário e restaurante!
```

**Vantagem:** Escrita rápida, leitura mais lenta mas com dados frescos.

---

### 2.4 Estratégia 3: Hybrid Approach (Melhor Prática)

**Combinar ambas estratégias:**

```javascript
// ============================================================
// Dados que mudam raramente → Embutir (Embedded)
// Dados que mudam frequentemente → Buscar (Lookup)
// ============================================================

db.pedidos.insertOne({
  _id: ObjectId(),
  
  // SNAPSHOT (imutável) - Dados históricos preservados
  usuario_snapshot: {
    _id: 100,
    nome: "João Silva",
    email: "joao@old.email"  // Email da época do pedido
  },

  // REFERENCE - Sempre buscar atual
  usuario_id: 100,  // Para lookup se precisar dados atualizados

  // SNAPSHOT (imutável) - Preço da época
  itens_snapshot: [
    { prato_id: 1, nome: "Pizza", preco: 45.00 }  // Preço histórico
  ],

  // Reference - Para lookup se precisar menu atual
  restaurante_id: 50,

  data_pedido: new Date(),
  status: 'entregue'
});

// ============================================================
// Query: Mostrar histórico (com dados da época)
// ============================================================

db.pedidos.findOne({ _id: ObjectId("pedido_123") });
// Mostra usuario_snapshot e itens_snapshot (histórico puro)

// ============================================================
// Query: Mostrar dados atualizados (para admin)
// ============================================================

db.pedidos.aggregate([
  { $match: { _id: ObjectId("pedido_123") } },
  {
    $lookup: {
      from: 'usuarios',
      localField: 'usuario_id',
      foreignField: '_id',
      as: 'usuario_atual'
    }
  },
  { $unwind: '$usuario_atual' }
]).toArray();
// Mostra usuario_atual (dados em tempo real)
```

---

### 2.5 Estratégia 4: Trigger/Webhook Pattern (Assíncrono)

Para atualizar Embedded de forma **assíncrona** sem bloquear:

```javascript
// ============================================================
// Usando Bull (fila de tarefas)
// ============================================================

const Queue = require('bull');
const atualizacaoQueue = new Queue('atualizacoes-denormalizadas');

// ============================================================
// Quando usuário muda, enfileirar atualização
// ============================================================

async function atualizarUsuarioComFila(db, usuario_id, novosDados) {
  // PASSO 1: Atualizar documento principal (rápido)
  await db.collection('usuarios').updateOne(
    { _id: usuario_id },
    { $set: novosDados }
  );

  // PASSO 2: Enfileirar atualização de denormalizações (async)
  await atualizacaoQueue.add(
    {
      tipo: 'usuario',
      usuario_id: usuario_id,
      campos: Object.keys(novosDados)
    },
    { delay: 1000 }  // Executar após 1 segundo
  );

  console.log('✅ Usuário atualizado. Denormalizações enfileiradas.');
}

// ============================================================
// Worker: Processa fila de forma assíncrona
// ============================================================

atualizacaoQueue.process(async (job) => {
  const { usuario_id, campos } = job.data;

  console.log(`🔄 Atualizando denormalizações para usuário ${usuario_id}...`);

  // Buscar dados atualizados do usuário
  const usuarioAtualizado = await db.collection('usuarios')
    .findOne({ _id: usuario_id });

  // Atualizar em pedidos
  await db.collection('pedidos').updateMany(
    { 'usuario.id': usuario_id },
    { $set: { usuario: usuarioAtualizado } }
  );

  // Atualizar em comentários
  await db.collection('comentarios').updateMany(
    { 'autor.id': usuario_id },
    { $set: { autor: usuarioAtualizado } }
  );

  console.log(`✅ Denormalizações atualizadas para usuário ${usuario_id}`);
  return { sucesso: true, usuario_id };
});

// ============================================================
// Event Listeners
// ============================================================

atualizacaoQueue.on('completed', (job, result) => {
  console.log(`✅ Job completado:`, result);
});

atualizacaoQueue.on('failed', (job, err) => {
  console.error(`❌ Job falhou:`, err.message);
  // Retry automático
});
```

**Vantagem:** Usuário vê atualização imediatamente (principal), denormalizações sincronizam depois.

---

### 2.6 Estratégia 5: Change Streams (Event-Driven)

Monitorar mudanças em tempo real e atualizar Embedded automaticamente:

```javascript
// ============================================================
// Monitorar mudanças em usuarios collection
// ============================================================

const changeStream = db.collection('usuarios').watch();

changeStream.on('change', async (change) => {
  console.log('Mudança detectada:', change);

  // Determinar tipo de operação
  const operationType = change.operationType;  // insert, update, delete, replace
  const usuario_id = change.documentKey._id;

  if (operationType === 'update' || operationType === 'replace') {
    // PASSO 1: Buscar usuário atualizado
    const usuarioAtualizado = await db.collection('usuarios')
      .findOne({ _id: usuario_id });

    // PASSO 2: Atualizar todas as cópias
    const colecoes = ['pedidos', 'comentarios', 'avaliacoes', 'posts'];

    for (const colecao of colecoes) {
      const resultado = await db.collection(colecao).updateMany(
        { 'usuario.id': usuario_id },
        { $set: { usuario: usuarioAtualizado } }
      );

      if (resultado.modifiedCount > 0) {
        console.log(
          `✅ ${resultado.modifiedCount} documentos atualizados em ${colecao}`
        );
      }
    }

  } else if (operationType === 'delete') {
    // Se usuário foi deletado, remover ou marcar referências
    console.log(`⚠️  Usuário ${usuario_id} foi deletado`);

    await db.collection('pedidos').updateMany(
      { 'usuario.id': usuario_id },
      { $set: { usuario: { id: usuario_id, nome: '[USUÁRIO DELETADO]' } } }
    );
  }
});

// ============================================================
// Parar de monitorar
// ============================================================

// changeStream.close();
```

**Vantagem:** Automático, reativo, escalável.

---

### 2.7 Matriz: Qual Estratégia Usar?

| Estratégia | Quando Mudar | Performance Escrita | Performance Leitura | Complexidade |
|----------|:---:|:---:|:---:|:---:|
| **Denormalize on Write** | Frequente (diário) | ❌ Lenta | ✅ Rápida | ⚠️ Média |
| **Denormalize on Read** | Raro (anual) | ✅ Rápida | ❌ Lenta | ⚠️ Média |
| **Hybrid** | Variável | ✅ Média | ✅ Média | ⚠️ Média |
| **Fila (Bull)** | Frequente | ✅ Rápida | ✅ Rápida | ❌ Alta |
| **Change Streams** | Frequente | ✅ Rápida | ✅ Rápida | ❌ Alta |

---

### 2.8 Implementação Completa: Caso iFood

#### Cenário: Quando Restaurante Muda de Nome

```javascript
// ============================================================
// Mapa de denormalizações para Restaurante
// ============================================================

const DENORM_RESTAURANTE = {
  nome: ['pedidos', 'pratos', 'avaliacoes'],
  avatar_url: ['pedidos', 'pratos'],
  telefone: ['pedidos']
};

// ============================================================
// Atualizar restaurante com sincronização
// ============================================================

async function atualizarRestauranteSync(db, restaurante_id, novosDados) {
  const session = await db.getMongo().startSession();
  session.startTransaction();

  try {
    // PASSO 1: Atualizar restaurante principal
    const resultRestaurante = await db.collection('restaurantes')
      .updateOne(
        { _id: restaurante_id },
        { $set: novosDados },
        { session }
      );

    if (resultRestaurante.modifiedCount === 0) {
      throw new Error('Restaurante não encontrado');
    }

    // PASSO 2: Atualizar TODAS as cópias em transação
    for (const [campo, colecoes] of Object.entries(DENORM_RESTAURANTE)) {
      if (!(campo in novosDados)) continue;  // Campo não foi alterado

      for (const colecao of colecoes) {
        const resultado = await db.collection(colecao).updateMany(
          { 'restaurante.id': restaurante_id },
          { $set: { [`restaurante.${campo}`]: novosDados[campo] } },
          { session }
        );

        console.log(
          `📝 ${colecao}: ${resultado.modifiedCount} documentos atualizados`
        );
      }
    }

    await session.commitTransaction();
    console.log('✅ Restaurante e denormalizações sincronizadas com sucesso');

  } catch (erro) {
    await session.abortTransaction();
    console.error('❌ Erro na sincronização:', erro.message);
    throw erro;

  } finally {
    await session.endSession();
  }
}

// ============================================================
// USO
// ============================================================

try {
  await atualizarRestauranteSync(db, ObjectId("rest_123"), {
    nome: "Pizzaria Nova",
    telefone: "1133335555"
  });
} catch (erro) {
  // Tratamento de erro
}
```

---

### 2.9 Checklist: Automação de Embedded

- [ ] Identifiquei quais dados estão duplicados (embedded)?
- [ ] Com que frequência esses dados mudam?
- [ ] Preciso sempre de dados atualizados ao ler?
- [ ] Quantas coleções contêm as cópias?
- [ ] Criei mapa de denormalizações?
- [ ] Escolhi estratégia (Write, Read, Hybrid, Fila, Stream)?
- [ ] Implementei validação de integridade?
- [ ] Fiz testes com múltiplas atualizações simultâneas?
- [ ] Documentei a estratégia no código?
- [ ] Monitorei performance?

---

## RESUMO FINAL

### Integridade Referencial:

1. **Application-Level** → Validar antes de inserir ✅
2. **Mongoose Validation** → Schema com validadores ✅
3. **Transactions** → Múltiplas operações atômicas ✅
4. **Change Streams** → Detectar e limpar referências órfãs ✅
5. **Índices** → Garantir uniqueness/existence ✅

### Automação de Embedded:

1. **Denormalize on Write** → Síncrono, todos os dados frescos sempre
2. **Denormalize on Read** → Assíncrono, buscar ao ler
3. **Hybrid** → Snapshot (histórico) + Lookup (atual)
4. **Fila (Bull)** → Assíncrono, sem bloquear
5. **Change Streams** → Reativo, automático

**Regra de Ouro:** Use **Change Streams + Fila (Bull)** para aplicações modernas. É escalável, reativo e não bloqueia operações principais.

---

**Próximos Tópicos:** Indexação para Performance, Replicação, Sharding (particionamento).
