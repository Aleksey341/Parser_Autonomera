-- ============================================================================
-- МВП-аналитика: Интерактивный дашборд оценки эффективности глав МО
-- SQL: Справочники и измерения (Dimensions)
-- ============================================================================

-- Включаем расширения
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- СПРАВОЧНИК 1: Муниципальные образования Липецкой области
-- ============================================================================

DROP TABLE IF EXISTS dim_municipalities CASCADE;
CREATE TABLE dim_municipalities (
    mo_id SMALLINT PRIMARY KEY,
    mo_name VARCHAR(255) NOT NULL UNIQUE,
    mo_name_short VARCHAR(50),
    oktmo VARCHAR(8) NOT NULL UNIQUE,
    okato VARCHAR(5),
    region_code VARCHAR(2) DEFAULT '48',  -- Липецкая область

    -- Географические данные
    lat DECIMAL(10, 6),
    lon DECIMAL(10, 6),
    geojson_id VARCHAR(50),  -- ID для связки с GeoJSON

    -- Статистика МО
    population INTEGER,
    area_km2 DECIMAL(8, 2),

    -- Тип МО (город, район, городской округ)
    mo_type VARCHAR(50),

    -- Статус в системе
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Примечание: данные для Липецкой области заполняются отдельно
INSERT INTO dim_municipalities (mo_id, mo_name, mo_name_short, oktmo, okato, lat, lon, geojson_id, population, area_km2, mo_type) VALUES
(1, 'Город Липецк', 'г. Липецк', '48701000', '48401', 52.6134, 39.5945, 'MO_1', 502_000, NULL, 'город'),
(2, 'Липецкий муниципальный район', 'Липецкий р-н', '48710000', '48401', 52.6500, 39.8000, 'MO_2', 145_000, NULL, 'район'),
(3, 'Елецкий муниципальный район', 'Елецкий р-н', '48703000', '48402', 52.4356, 39.2032, 'MO_3', 78_000, NULL, 'район'),
(4, 'Город Елец', 'г. Елец', '48702000', '48402', 52.4433, 39.2064, 'MO_4', 113_000, NULL, 'город'),
(5, 'Лебедянский муниципальный район', 'Лебедянский р-н', '48705000', '48403', 52.0725, 40.2539, 'MO_5', 52_000, NULL, 'район'),
(6, 'Город Лебедянь', 'г. Лебедянь', '48704000', '48403', 52.0875, 40.2667, 'MO_6', 32_000, NULL, 'город'),
(7, 'Становлянский муниципальный район', 'Становлянский р-н', '48710000', '48404', 52.2000, 38.5000, 'MO_7', 28_000, NULL, 'район'),
(8, 'Добровский муниципальный район', 'Добровский р-н', '48712000', '48405', 51.9000, 38.8000, 'MO_8', 35_000, NULL, 'район'),
(9, 'Тамбовский муниципальный район', 'Тамбовский р-н', '48714000', '48406', 52.3000, 40.9000, 'MO_9', 40_000, NULL, 'район'),
(10, 'Грязинский муниципальный район', 'Грязинский р-н', '48711000', '48407', 52.8850, 40.5550, 'MO_10', 65_000, NULL, 'район');

CREATE INDEX idx_dim_municipalities_oktmo ON dim_municipalities(oktmo);
CREATE INDEX idx_dim_municipalities_name ON dim_municipalities(mo_name);


-- ============================================================================
-- СПРАВОЧНИК 2: Периоды отчетности
-- ============================================================================

DROP TABLE IF EXISTS dim_period CASCADE;
CREATE TABLE dim_period (
    period_id SMALLINT PRIMARY KEY,
    period_type VARCHAR(20) NOT NULL,  -- 'month', 'halfyear', 'year'
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,

    -- Флаги для особых случаев
    is_edg_period BOOLEAN DEFAULT FALSE,  -- Совпадает ли с ЕДГ
    is_publication_period BOOLEAN DEFAULT FALSE,  -- Период публикации рейтинга

    -- Текстовое описание
    description VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Инициализируем периоды: 2024-01 по 2025-06 (18 месяцев)
INSERT INTO dim_period (period_id, period_type, date_from, date_to, is_edg_period, is_publication_period, description) VALUES
(202401, 'month', '2024-01-01', '2024-01-31', FALSE, FALSE, 'Январь 2024'),
(202402, 'month', '2024-02-01', '2024-02-29', FALSE, FALSE, 'Февраль 2024'),
(202403, 'month', '2024-03-01', '2024-03-31', FALSE, FALSE, 'Март 2024'),
(202404, 'month', '2024-04-01', '2024-04-30', FALSE, FALSE, 'Апрель 2024'),
(202405, 'month', '2024-05-01', '2024-05-31', FALSE, FALSE, 'Май 2024'),
(202406, 'month', '2024-06-01', '2024-06-30', FALSE, TRUE, 'Июнь 2024 (Полугодовой срез)'),
(202407, 'month', '2024-07-01', '2024-07-31', FALSE, FALSE, 'Июль 2024'),
(202408, 'month', '2024-08-01', '2024-08-31', FALSE, FALSE, 'Август 2024'),
(202409, 'month', '2024-09-01', '2024-09-30', FALSE, FALSE, 'Сентябрь 2024'),
(202410, 'month', '2024-10-01', '2024-10-31', FALSE, FALSE, 'Октябрь 2024'),
(202411, 'month', '2024-11-01', '2024-11-30', FALSE, FALSE, 'Ноябрь 2024'),
(202412, 'month', '2024-12-01', '2024-12-31', FALSE, FALSE, 'Декабрь 2024'),
(202501, 'month', '2025-01-01', '2025-01-31', FALSE, TRUE, 'Январь 2025 (Полугодовой срез)'),
(202502, 'month', '2025-02-01', '2025-02-28', FALSE, FALSE, 'Февраль 2025'),
(202503, 'month', '2025-03-01', '2025-03-31', FALSE, FALSE, 'Март 2025'),
(202504, 'month', '2025-04-01', '2025-04-30', FALSE, FALSE, 'Апрель 2025'),
(202505, 'month', '2025-05-01', '2025-05-31', FALSE, FALSE, 'Май 2025'),
(202506, 'month', '2025-06-01', '2025-06-30', FALSE, FALSE, 'Июнь 2025');

-- Полугодовые и годовые сводки
INSERT INTO dim_period (period_id, period_type, date_from, date_to, is_edg_period, is_publication_period, description) VALUES
(202406, 'halfyear', '2024-01-01', '2024-06-30', FALSE, TRUE, '1-е полугодие 2024'),
(202412, 'halfyear', '2024-07-01', '2024-12-31', FALSE, TRUE, '2-е полугодие 2024'),
(202412, 'year', '2024-01-01', '2024-12-31', FALSE, FALSE, 'Год 2024');

CREATE INDEX idx_dim_period_type ON dim_period(period_type);
CREATE INDEX idx_dim_period_dates ON dim_period(date_from, date_to);


-- ============================================================================
-- СПРАВОЧНИК 3: Показатели (индикаторы) по методике
-- ============================================================================

DROP TABLE IF EXISTS dim_indicators CASCADE;
CREATE TABLE dim_indicators (
    ind_id SMALLINT PRIMARY KEY,
    ind_code VARCHAR(50) NOT NULL UNIQUE,

    -- Классификация
    block_name VARCHAR(100) NOT NULL,  -- Блок методики
    is_public BOOLEAN DEFAULT TRUE,    -- Публичный или закрытый показатель

    -- Описание показателя
    display_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Единица измерения
    unit VARCHAR(50),
    calc_rule_id VARCHAR(100),  -- Идентификатор формулы расчета

    -- Для справочников
    owner_org VARCHAR(255),  -- Организация-владелец (МВП, ММП, Минобр, МЭР и т.д.)

    -- Шкала оценки (может быть переопределена в map_scale по версиям)
    min_value DECIMAL(10, 2),
    max_value DECIMAL(10, 2),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Вставляем показатели согласно методике (17 критериев: 9 публичных + 8 закрытых)

-- ПУБЛИЧНЫЙ РЕЙТИНГ (макс 31)
-- Блок 1: Политический менеджмент (макс 11)
INSERT INTO dim_indicators VALUES
(1, 'PUB_001_SUPPORT', 'Политический менеджмент', TRUE,
 'Поддержка со стороны руководства области',
 'Оценка поддержки главы МО со стороны губернатора и АПП',
 'баллы', 'calc_support', 'МВП + АЦ', 0, 3),
(2, 'PUB_002_AGP_TASKS', 'Политический менеджмент', TRUE,
 'Эффективность выполнения задач АГП',
 'Доля выполненных целевых показателей АГП (51-100%)',
 'баллы', 'calc_agp_tasks', 'МВП + АЦ', 0, 5),
(3, 'PUB_003_POSITION', 'Политический менеджмент', TRUE,
 'Уникальное позиционирование главы',
 'Имидж главы в регионе: функционер/хозяйственник или размытое',
 'баллы', 'calc_positioning', 'МВП + медиамониторинг', 0, 3),
(4, 'PUB_004_PROJECTS', 'Политический менеджмент', TRUE,
 'Проектная деятельность главы',
 'Реализация 1+ региональных и 1+ муниципальных проектов',
 'баллы', 'calc_projects', 'МВП + АЦ', 0, 3);

-- Блок 2: Забота и внимание (макс 9)
INSERT INTO dim_indicators VALUES
(5, 'PUB_005_VOLUNTEERS', 'Забота и внимание', TRUE,
 'Доля молодёжи в добровольчестве (14-35 лет)',
 'Процент молодых волонтёров от общего числа',
 '%', 'calc_volunteers', 'ММП + Минобр', 0, 3),
(6, 'PUB_006_DP_ACTIVE', 'Забота и внимание', TRUE,
 'Доля активных участников Движения Первых (6-18 лет)',
 'Процент детей в Движении Первых от учащихся 6-18 лет',
 '%', 'calc_dp_active', 'Минобр + ММП', 0, 3),
(7, 'PUB_007_VETERANS', 'Забота и внимание', TRUE,
 'Личная вовлечённость главы в работу с ветеранами/семьями СВО',
 'Частота встреч, решённые проблемы, доля участия',
 'баллы', 'calc_head_veterans', 'Администрация МО', 0, 3);

-- Блок 3: Развитие кадрового и проектного потенциала (макс 11)
INSERT INTO dim_indicators VALUES
(8, 'PUB_008_RESERVE', 'Развитие кадрового и проектного потенциала', TRUE,
 'Формирование кадрового резерва МО',
 'Доля должностей, покрытых резервом (30-100%)',
 '%', 'calc_reserve', 'Администрация МО', 0, 3),
(9, 'PUB_009_GRANTS', 'Развитие кадрового и проектного потенциала', TRUE,
 'Эффективность работы с грантами',
 'Число побед (0-3+), сумма (млн.руб.), отсутствие нарушений',
 'баллы', 'calc_grants', 'МЭР', 0, 3);

-- ЗАКРЫТЫЙ РЕЙТИНГ (макс 35)
INSERT INTO dim_indicators VALUES
(10, 'CLOSED_001_PARTY', 'Закрытый рейтинг', FALSE,
 'Партийное мнение в Администрации МО',
 'Доля членов партии (0-3) + сторонников (0-3)',
 'баллы', 'calc_party_opinion', 'РО "Единая Россия"', 0, 6),
(11, 'CLOSED_002_ALT_OPINION', 'Закрытый рейтинг', FALSE,
 'Альтернативное мнение в представительном органе',
 'Доля мест партии: 100%→4, 94%→2, <94%→0',
 'баллы', 'calc_alt_opinion', 'МВП + АЦ', 0, 4),
(12, 'CLOSED_003_AGP_LEVEL', 'Закрытый рейтинг', FALSE,
 'Достижение целевых показателей АГП (уровень)',
 'Не выполнен (0), выполнен (3), превышен ≤10% (5)',
 'баллы', 'calc_agp_level', 'МВП + АЦ', 0, 5),
(13, 'CLOSED_004_AGP_QUALITY', 'Закрытый рейтинг', FALSE,
 'Достижение целевых показателей АГП (качество)',
 'Не выполнен (0), выполнен (3), превышен ≤10% (5)',
 'баллы', 'calc_agp_quality', 'МВП + АЦ', 0, 5),
(14, 'CLOSED_005_ECO_ATTRACT', 'Закрытый рейтинг', FALSE,
 'Экономическая привлекательность МО',
 'Высокая (1), средняя (2), низкая (3) — чем ниже, тем выше балл',
 'баллы', 'calc_eco_attract', 'МВП + АЦ', 1, 3),
(15, 'CLOSED_006_VETERANS_ACT', 'Закрытый рейтинг', FALSE,
 'Общественно-политическая деятельность ветеранов СВО',
 'Доля членов партии (0-3) + сторонников (0-3)',
 'баллы', 'calc_veterans_activity', 'РО "Единая Россия"', 0, 6),
(16, 'CLOSED_007_PRIDE', 'Закрытый рейтинг', FALSE,
 'Представители МО в проекте "Гордость Липецкой земли"',
 '≥1 представитель (2), иначе (0)',
 'баллы', 'calc_pride', 'АО ИС + партия', 0, 2);

CREATE INDEX idx_dim_indicators_code ON dim_indicators(ind_code);
CREATE INDEX idx_dim_indicators_block ON dim_indicators(block_name);
CREATE INDEX idx_dim_indicators_public ON dim_indicators(is_public);


-- ============================================================================
-- СПРАВОЧНИК 4: Штрафные критерии
-- ============================================================================

DROP TABLE IF EXISTS dim_penalties CASCADE;
CREATE TABLE dim_penalties (
    pen_id SMALLINT PRIMARY KEY,
    pen_code VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Ведомство-владелец и мониторинг
    owner_org VARCHAR(255),
    detection_method VARCHAR(100),  -- 'media_monitoring', 'law_enforcement', 'complaint', 'observation'

    -- Возможные баллы штрафа
    min_penalty DECIMAL(5, 1) DEFAULT 0,
    max_penalty DECIMAL(5, 1) DEFAULT -3,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO dim_penalties VALUES
(1, 'PENALTY_001_CONFLICT_REGIONAL',
 'Конфликты с региональной властью',
 'Серьезное расхождение с позицией губернатора: 0 (нет), −2 (спор), −3 (открытое противостояние)',
 'МВП + АЦ', 'observation', 0, -3),
(2, 'PENALTY_002_CONFLICT_INTERNAL',
 'Внутримуниципальные конфликты',
 'Частота и резонанс конфликтов в представительном органе или администрации: −1, −2, −3',
 'МВП + медиамониторинг', 'media_monitoring', 0, -3),
(3, 'PENALTY_003_LAW_ENFORCEMENT',
 'Вмешательство правоохранительных органов и репутационные потери',
 'Возбуждение дел, расследования: 0 (нет), −2 (административные), −5 (серьёзные/уголовные)',
 'ПО + медиамониторинг', 'law_enforcement', 0, -5);

CREATE INDEX idx_dim_penalties_code ON dim_penalties(pen_code);


-- ============================================================================
-- СПРАВОЧНИК 5: Версионирование методики
-- ============================================================================

DROP TABLE IF EXISTS dim_methodology_versions CASCADE;
CREATE TABLE dim_methodology_versions (
    version_id VARCHAR(10) PRIMARY KEY,
    version_name VARCHAR(100),
    description TEXT,

    -- Действие методики
    valid_from DATE NOT NULL,
    valid_to DATE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Метаданные
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),
    notes TEXT
);

INSERT INTO dim_methodology_versions VALUES
('v1', 'Методика v1.0', 'Первая официальная версия методики оценки эффективности глав МО',
 '2024-01-01', NULL, TRUE, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'admin',
 'Утверждена предварительно. Публичный рейтинг (макс 31) + закрытый (макс 35) + штрафы.');

-- Структура для хранения весов по версиям добавляется в map_scale


-- ============================================================================
-- СПРАВОЧНИК 6: Шкалы и граничные значения
-- ============================================================================

DROP TABLE IF EXISTS map_scale CASCADE;
CREATE TABLE map_scale (
    scale_id SERIAL PRIMARY KEY,
    version_id VARCHAR(10) NOT NULL,

    -- Применяется к показателю или глобально
    ind_id SMALLINT,
    pen_id SMALLINT,

    -- Пороги значений
    threshold_min DECIMAL(10, 2),
    threshold_max DECIMAL(10, 2),
    score DECIMAL(5, 1),

    -- Для интегральной шкалы (ind_id IS NULL, pen_id IS NULL)
    zone_name VARCHAR(20),  -- 'green', 'yellow', 'red'
    color_hex VARCHAR(7),   -- #00AA00, #FFCC00, #CC0000

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (version_id) REFERENCES dim_methodology_versions(version_id),
    FOREIGN KEY (ind_id) REFERENCES dim_indicators(ind_id),
    FOREIGN KEY (pen_id) REFERENCES dim_penalties(pen_id)
);

-- Интегральная шкала для v1 (светофор 0-66 баллов)
INSERT INTO map_scale (version_id, ind_id, pen_id, threshold_min, threshold_max, zone_name, color_hex) VALUES
('v1', NULL, NULL, 53, 66, 'green', '#00AA00'),    -- Зелёная зона: 53-66
('v1', NULL, NULL, 29, 52, 'yellow', '#FFCC00'),   -- Жёлтая зона: 29-52
('v1', NULL, NULL, 0, 28, 'red', '#CC0000');        -- Красная зона: 0-28

CREATE INDEX idx_map_scale_version ON map_scale(version_id);
CREATE INDEX idx_map_scale_indicator ON map_scale(ind_id);
CREATE INDEX idx_map_scale_zone ON map_scale(zone_name);


-- ============================================================================
-- СПРАВОЧНИК 7: Реестр источников данных
-- ============================================================================

DROP TABLE IF EXISTS src_registry CASCADE;
CREATE TABLE src_registry (
    source_id SMALLINT PRIMARY KEY,
    org_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),

    -- Канал и график
    channel VARCHAR(50),  -- 'API', 'SFTP', 'Excel', 'Manual'
    transfer_schedule VARCHAR(255),  -- 'ежемесячно 5-го числа', 'по запросу' и т.д.
    format VARCHAR(100),  -- 'JSON', 'CSV', 'XLSX', 'SQL'

    -- SLA
    sla_days SMALLINT DEFAULT 5,  -- дней от конца месяца
    description TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO src_registry VALUES
(1, 'МВП и АЦ', 'Иванов И.И.', 'ivanov@region.ru', '+7-999-000-0000',
 'Manual', 'ежемесячно 5-го числа', 'Excel/API', 5,
 'Поддержка руководства, задачи АГП, конфликты, экономика, АГП уровень/качество'),
(2, 'Минобразование Липецкой области', 'Петров П.П.', 'petrov@minobr.ru', '+7-999-111-1111',
 'Excel', 'ежемесячно 1-го числа', 'XLSX', 1,
 'Движение Первых (активные участники 6-18 лет), добровольчество'),
(3, 'ММП (молодёжь и политика)', 'Сидоров С.С.', 'sidorov@mmp.ru', '+7-999-222-2222',
 'Excel', 'ежемесячно 3-го числа', 'XLSX', 3,
 'Добровольчество (молодёжь 14-35), "Движение Первых"'),
(4, 'МЭР (развитие)', 'Смирнов С.М.', 'smirnov@mer.ru', '+7-999-333-3333',
 'Excel', 'ежеквартально 5-го числа', 'XLSX', 5,
 'Гранты (победы, суммы, нарушения)'),
(5, 'РО "Единая Россия"', 'Новиков Н.Н.', 'novikov@er.ru', '+7-999-444-4444',
 'Manual', 'ежеквартально', 'Excel/Manual', 7,
 'Партийное мнение (члены, сторонники), активность ветеранов СВО'),
(6, 'Администрации МО', 'Главы МО', 'info@mo.ru', NULL,
 'Excel', 'ежемесячно 7-го числа', 'XLSX', 7,
 'Кадровый резерв, личная вовлечённость главы (встречи, решённые проблемы)'),
(7, 'Медиамониторинг и медиа', NULL, NULL, NULL,
 'Automated', 'ежедневно', 'JSON', 1,
 'Конфликты, медиа-упоминания, репутационные события'),
(8, 'Правоохранительные органы', NULL, NULL, NULL,
 'Manual', 'по событиям', 'Manual', NULL,
 'Возбуждение дел, расследования, уголовные преследования');

CREATE INDEX idx_src_registry_org ON src_registry(org_name);


-- ============================================================================
-- ТАБЛИЦА: Аудит и логирование
-- ============================================================================

DROP TABLE IF EXISTS audit_log CASCADE;
CREATE TABLE audit_log (
    log_id SERIAL PRIMARY KEY,

    -- Кто выполнил
    actor_id VARCHAR(255),
    actor_role VARCHAR(50),

    -- Что выполнено
    action VARCHAR(100),  -- 'INSERT', 'UPDATE', 'DELETE', 'LOAD', 'RECALC'
    entity_type VARCHAR(100),  -- 'indicator', 'penalty', 'methodology', 'rating'
    entity_id VARCHAR(255),

    -- Хеш полезной нагрузки для контроля целостности
    payload_hash VARCHAR(64),

    -- Когда
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Доп. информация
    details TEXT,
    ip_address VARCHAR(45)
);

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);


-- ============================================================================
-- ЗАВЕРШЕНИЕ
-- ============================================================================

COMMIT;
