CREATE DATABASE IF NOT EXISTS jifc;
USE jifc;

-- =========================================================================
-- 1. TABELA DE CAMPUS (Instituições)
-- =========================================================================
CREATE TABLE campus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    cidade VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL, 
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 2. TABELA DE ADMINISTRADORES
-- =========================================================================
CREATE TABLE administradores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 3. TABELA DE MODALIDADES (Melhorada com Gênero)
-- =========================================================================
CREATE TABLE modalidades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    genero ENUM('Masculino', 'Feminino', 'Misto') NOT NULL, -- Evita misturar categorias
    tipo_confronto ENUM('Coletivo', 'Individual') NOT NULL, 
    formato_disputa ENUM('Grupos + Mata-Mata', 'Sistema Suico', 'Baterias por Tempo') NOT NULL,
    UNIQUE KEY uq_modalidade_genero (nome, genero) -- Impede duplicar "Futsal Masculino" duas vezes
);

-- =========================================================================
-- 4. TABELA DE ATLETAS
-- =========================================================================
CREATE TABLE atletas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campus_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    matricula VARCHAR(30) NOT NULL UNIQUE,
    genero ENUM('Masculino', 'Feminino') NOT NULL,
    data_nascimento DATE NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE
);

-- =========================================================================
-- 5. TABELA INTERMEDIÁRIA: INSCRIÇÕES DE ATLETAS NAS MODALIDADES
-- =========================================================================
CREATE TABLE atleta_modalidade (
    atleta_id INT NOT NULL,
    modalidade_id INT NOT NULL,
    PRIMARY KEY (atleta_id, modalidade_id),
    FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE,
    FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE
);

-- =========================================================================
-- 6. TABELA DE CHAVES (Grupos do torneio) - CORRIGIDA
-- =========================================================================
CREATE TABLE chaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modalidade_id INT NOT NULL,
    
    -- Criamos uma coluna simples para você passar se é a chave 1, 2 ou 3 da modalidade
    numero_chave INT NOT NULL DEFAULT 1, 
    
    -- Agora a coluna gerada aponta para 'numero_chave', o que é 100% permitido!
    nome_chave CHAR(1) GENERATED ALWAYS AS (CHAR(numero_chave + 64 USING utf8mb4)) STORED, 
    
    FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE,
    
    -- Garante que você não crie por acidente duas "Chaves A" na mesma modalidade
    UNIQUE KEY uq_modalidade_numero_chave (modalidade_id, numero_chave)
);

-- =========================================================================
-- 7. TABELA INTERMEDIÁRIA: MODALIDADES QUE O CAMPUS VAI PARTICIPAR
-- =========================================================================
CREATE TABLE campus_modalidade (
    campus_id INT NOT NULL,
    modalidade_id INT NOT NULL,
    chave_id INT DEFAULT NULL, 
    PRIMARY KEY (campus_id, modalidade_id),
    FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE,
    FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE,
    FOREIGN KEY (chave_id) REFERENCES chaves(id) ON DELETE SET NULL
);

-- =========================================================================
-- 8. TABELA DE JOGOS / CONFRONTOS 
-- =========================================================================
CREATE TABLE jogos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modalidade_id INT NOT NULL,
    fase ENUM('Fase de Grupos', 'Oitavas', 'Quartas', 'Semifinal', 'Final', 'Bateria Única', 'Eliminatória') NOT NULL, 
    
    -- Participantes Coletivos
    campus_1_id INT DEFAULT NULL,
    campus_2_id INT DEFAULT NULL,
    
    -- Participantes Individuais
    atleta_1_id INT DEFAULT NULL,
    atleta_2_id INT DEFAULT NULL,

    data_hora DATETIME NOT NULL,
    local_jogo VARCHAR(100) NOT NULL,
    status ENUM('Agendado', 'Em Andamento', 'Encerrado', 'Cancelado') DEFAULT 'Agendado',
    
    -- Vencedores (Estes podem manter o SET NULL tranquilamente, pois não estão no CHECK)
    vencedor_campus_id INT DEFAULT NULL,
    vencedor_atleta_id INT DEFAULT NULL,
    
    -- Chaves Estrangeiras Corrigidas para CASCADE nos participantes ativos
    FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE,
    FOREIGN KEY (campus_1_id) REFERENCES campus(id) ON DELETE CASCADE,
    FOREIGN KEY (campus_2_id) REFERENCES campus(id) ON DELETE CASCADE,
    FOREIGN KEY (atleta_1_id) REFERENCES atletas(id) ON DELETE CASCADE,
    FOREIGN KEY (atleta_2_id) REFERENCES atletas(id) ON DELETE CASCADE,
    
    -- Mantidos como SET NULL por segurança histórica dos vencedores
    FOREIGN KEY (vencedor_campus_id) REFERENCES campus(id) ON DELETE SET NULL,
    FOREIGN KEY (vencedor_atleta_id) REFERENCES atletas(id) ON DELETE SET NULL,

    -- GARANTIA DE INTEGRIDADE (Agora funciona 100% no MySQL 8.0+)
    CONSTRAINT chk_tipo_confronto CHECK (
        (campus_1_id IS NOT NULL AND atleta_1_id IS NULL) OR 
        (atleta_1_id IS NOT NULL AND campus_1_id IS NULL) OR 
        (campus_1_id IS NULL AND atleta_1_id IS NULL)
    )
);

-- =========================================================================
-- 9. TABELA PARA ESPORTES COLETIVOS TRADICIONAIS
-- =========================================================================
CREATE TABLE resultados_coletivos (
    jogo_id INT PRIMARY KEY,
    placar_1 INT NOT NULL DEFAULT 0, 
    placar_2 INT NOT NULL DEFAULT 0, 
    FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE
);

-- =========================================================================
-- 10. TABELA PARA ESPORTES POR SETS
-- =========================================================================
CREATE TABLE resultados_por_sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jogo_id INT NOT NULL,
    numero_set INT NOT NULL, 
    pontos_1 INT NOT NULL DEFAULT 0, 
    pontos_2 INT NOT NULL DEFAULT 0, 
    FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE,
    UNIQUE KEY uq_jogo_set (jogo_id, numero_set) -- Impede duplicar o "Set 1" para o mesmo jogo
);

-- =========================================================================
-- 11. TABELA PARA CORRIDAS / ATLETISMO / NATAÇÃO
-- =========================================================================
CREATE TABLE resultados_atletismo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jogo_id INT NOT NULL, 
    atleta_id INT NOT NULL,
    resultado_tempo TIME(3) DEFAULT NULL, 
    resultado_medida DECIMAL(5,2) DEFAULT NULL, 
    posicao_final INT DEFAULT NULL, 
    FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE,
    FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE
);

-- =========================================================================
-- 12. CONFIGURAÇÕES DO EVENTO
-- =========================================================================
CREATE TABLE configuracoes_evento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ano_evento INT NOT NULL DEFAULT 2026,
    inicio_inscricao_modalidades DATE NOT NULL,
    fim_inscricao_modalidades DATE NOT NULL,
    inicio_inscricao_atletas DATE NOT NULL,
    fim_inscricao_atletas DATE NOT NULL,
    inicio_sorteio_chaves DATE NOT NULL,
    fim_sorteio_chaves DATE NOT NULL,
    
    -- Validação para garantir que as datas fazem sentido cronológico
    CONSTRAINT chk_datas_modalidades CHECK (inicio_inscricao_modalidades <= fim_inscricao_modalidades),
    CONSTRAINT chk_datas_atletas CHECK (inicio_inscricao_atletas <= fim_inscricao_atletas)
);

-- =========================================================================
-- 13. TABELA DE CLASSIFICAÇÃO / PONTUAÇÃO GERAL (Fase de Grupos)
-- =========================================================================
CREATE TABLE classificacao_grupos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modalidade_id INT NOT NULL,
    chave_id INT NOT NULL,
    
    -- Participante: Pode ser um Campus (Coletivo) ou um Atleta (Individual)
    campus_id INT DEFAULT NULL,
    atleta_id INT DEFAULT NULL,
    
    -- Histórico básico comum a modalidades de confronto direto (Grupos / Suíço)
    pontos INT DEFAULT 0,
    jogos_jogados INT DEFAULT 0,
    vitorias INT DEFAULT 0,
    empates INT DEFAULT 0,       -- Fica zero em esportes sem empate (Vôlei, Basquete, Tênis de Mesa)
    derrotas INT DEFAULT 0,
    
    -- Estatísticas genéricas de pontuação (Aplica-se aos mais de 15 esportes):
    -- No Futsal/Handebol: Gols feitos e Gols sofridos
    -- No Vôlei/Tênis de Mesa: Sets ganhos e Sets perdidos
    -- No Basquete: Pontos convertidos e Pontos sofridos
    -- No Xadrez: Pontos de partida (1.0, 0.5, 0.0) acumulados aqui
    pontos_pro INT DEFAULT 0,
    pontos_contra INT DEFAULT 0,
    saldo_pontuacao INT GENERATED ALWAYS AS (pontos_pro - pontos_contra) STORED,

    FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE CASCADE,
    FOREIGN KEY (chave_id) REFERENCES chaves(id) ON DELETE CASCADE,
    FOREIGN KEY (campus_id) REFERENCES campus(id) ON DELETE CASCADE,
    FOREIGN KEY (atleta_id) REFERENCES atletas(id) ON DELETE CASCADE,
    
    -- Restrições de Integridade (Mantendo o padrão do seu banco de dados)
    CONSTRAINT uq_participante_por_chave UNIQUE (chave_id, campus_id, atleta_id),
    
    CONSTRAINT chk_tipo_participante_classificacao CHECK (
        (campus_id IS NOT NULL AND atleta_id IS NULL) OR
        (atleta_id IS NOT NULL AND campus_id IS NULL)
    )
);