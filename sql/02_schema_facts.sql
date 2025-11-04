-- ============================================================================
-- МВП-аналитика: Таблицы фактов (Facts)
-- ============================================================================

-- ============================================================================
-- ФАКТ-ТАБЛИЦА 1: Значения показателей
-- ============================================================================

DROP TABLE IF EXISTS fact_indicator_values CASCADE;
CREATE TABLE fact_indicator_values (
    fact_id SERIAL PRIMARY KEY,

    -- Ключи связей
    mo_id SMALLINT NOT NULL,
    period_id SMALLINT NOT NULL,
    ind_id SMALLINT NOT NULL,
    version_id VARCHAR(10) NOT NULL,

    -- Значения
    value_raw DECIMAL(12, 2),  -- Исходное значение из источника
    value_normalized DECIMAL(12, 2),  -- Нормализованное значение (если требуется)
    value_target DECIMAL(12, 2),  -- Целевое значение (если есть)

    -- Итоговый балл (рассчитанный по шкале)
    score DECIMAL(5, 1),
    score_calculated_at TIMESTAMP,

    -- Источник данных
    source_id SMALLINT,
    source_reference VARCHAR(255),  -- Ссылка на документ, файл, ID записи в системе источника

    -- Комментарии и примечания
    comment TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by VARCHAR(255),
    verified_at TIMESTAMP,

    -- Служебные поля
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_as_of_date DATE,  -- Дата, на которую актуальны данные

    FOREIGN KEY (mo_id) REFERENCES dim_municipalities(mo_id),
    FOREIGN KEY (period_id) REFERENCES dim_period(period_id),
    FOREIGN KEY (ind_id) REFERENCES dim_indicators(ind_id),
    FOREIGN KEY (version_id) REFERENCES dim_methodology_versions(version_id),
    FOREIGN KEY (source_id) REFERENCES src_registry(source_id),

    -- Уникальность: одна запись на (МО, период, индикатор, версия методики)
    UNIQUE(mo_id, period_id, ind_id, version_id)
);

CREATE INDEX idx_fact_indicator_mo ON fact_indicator_values(mo_id);
CREATE INDEX idx_fact_indicator_period ON fact_indicator_values(period_id);
CREATE INDEX idx_fact_indicator_ind ON fact_indicator_values(ind_id);
CREATE INDEX idx_fact_indicator_version ON fact_indicator_values(version_id);
CREATE INDEX idx_fact_indicator_source ON fact_indicator_values(source_id);
CREATE INDEX idx_fact_indicator_created ON fact_indicator_values(created_at);
CREATE INDEX idx_fact_indicator_composite ON fact_indicator_values(mo_id, period_id, version_id);


-- ============================================================================
-- ФАКТ-ТАБЛИЦА 2: Штрафные события
-- ============================================================================

DROP TABLE IF EXISTS fact_penalties CASCADE;
CREATE TABLE fact_penalties (
    penalty_fact_id SERIAL PRIMARY KEY,

    -- Ключи связей
    mo_id SMALLINT NOT NULL,
    period_id SMALLINT NOT NULL,
    pen_id SMALLINT NOT NULL,
    version_id VARCHAR(10) NOT NULL,

    -- Событие
    event_date DATE NOT NULL,
    event_type VARCHAR(100),  -- Тип события (тот же, что в dim_penalties)

    -- Штраф
    penalty_score DECIMAL(5, 1) NOT NULL,  -- Отрицательный балл
    severity_level VARCHAR(20),  -- 'minor' (-1), 'moderate' (-2), 'serious' (-3), 'critical' (-5)

    -- Обоснование и доказательства
    details TEXT,
    evidence_link VARCHAR(500),  -- Ссылка на документ, статью, протокол и т.д.

    -- Источник информации
    source_id SMALLINT,
    detection_date DATE,  -- Дата выявления

    -- Статус (может быть оспорен или отменён)
    status VARCHAR(50) DEFAULT 'active',  -- 'active', 'appealed', 'cancelled', 'appealed_approved', 'appealed_rejected'
    appeal_by VARCHAR(255),
    appeal_date TIMESTAMP,
    appeal_decision TEXT,

    -- Служебные поля
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (mo_id) REFERENCES dim_municipalities(mo_id),
    FOREIGN KEY (period_id) REFERENCES dim_period(period_id),
    FOREIGN KEY (pen_id) REFERENCES dim_penalties(pen_id),
    FOREIGN KEY (version_id) REFERENCES dim_methodology_versions(version_id),
    FOREIGN KEY (source_id) REFERENCES src_registry(source_id)
);

CREATE INDEX idx_fact_penalties_mo ON fact_penalties(mo_id);
CREATE INDEX idx_fact_penalties_period ON fact_penalties(period_id);
CREATE INDEX idx_fact_penalties_event_date ON fact_penalties(event_date);
CREATE INDEX idx_fact_penalties_status ON fact_penalties(status);
CREATE INDEX idx_fact_penalties_composite ON fact_penalties(mo_id, period_id, version_id);


-- ============================================================================
-- ФАКТ-ТАБЛИЦА 3: Сводные рейтинги (денормализованная для производительности)
-- ============================================================================

DROP TABLE IF EXISTS fact_summary_ratings CASCADE;
CREATE TABLE fact_summary_ratings (
    rating_id SERIAL PRIMARY KEY,

    -- Ключи
    mo_id SMALLINT NOT NULL,
    period_id SMALLINT NOT NULL,
    version_id VARCHAR(10) NOT NULL,

    -- Компоненты итогового балла
    score_public DECIMAL(5, 1),  -- Публичный рейтинг (макс 31)
    score_closed DECIMAL(5, 1),  -- Закрытый рейтинг (макс 35)
    score_penalties DECIMAL(5, 1) DEFAULT 0,  -- Штрафы (обычно ≤ 0)
    score_total DECIMAL(5, 1),  -- Итоговый балл

    -- Зона (определяется по итоговому баллу)
    zone VARCHAR(20),  -- 'green' (53-66), 'yellow' (29-52), 'red' (0-28)

    -- Динамика
    score_prev_period DECIMAL(5, 1),  -- Балл в предыдущий период
    score_change DECIMAL(5, 1),  -- Изменение балла (текущий - предыдущий)
    trend VARCHAR(20),  -- 'up', 'down', 'stable'

    -- Выполнение целей (% индикаторов со значением)
    indicators_total_count SMALLINT,
    indicators_filled_count SMALLINT,
    completion_rate DECIMAL(5, 2),  -- Процент: filled/total

    -- Служебные поля
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (mo_id) REFERENCES dim_municipalities(mo_id),
    FOREIGN KEY (period_id) REFERENCES dim_period(period_id),
    FOREIGN KEY (version_id) REFERENCES dim_methodology_versions(version_id),

    -- Уникальность: одна запись на (МО, период, версия)
    UNIQUE(mo_id, period_id, version_id)
);

CREATE INDEX idx_fact_summary_mo ON fact_summary_ratings(mo_id);
CREATE INDEX idx_fact_summary_period ON fact_summary_ratings(period_id);
CREATE INDEX idx_fact_summary_version ON fact_summary_ratings(version_id);
CREATE INDEX idx_fact_summary_zone ON fact_summary_ratings(zone);
CREATE INDEX idx_fact_summary_score ON fact_summary_ratings(score_total DESC);
CREATE INDEX idx_fact_summary_composite ON fact_summary_ratings(mo_id, period_id, version_id);


-- ============================================================================
-- ФАКТ-ТАБЛИЦА 4: Журнал событий (встречи, конфликты, решения)
-- ============================================================================

DROP TABLE IF EXISTS fact_events CASCADE;
CREATE TABLE fact_events (
    event_id SERIAL PRIMARY KEY,

    -- Ключи
    mo_id SMALLINT,  -- NULL если событие глобальное
    period_id SMALLINT,

    -- Событие
    event_type VARCHAR(100),  -- 'meeting', 'conflict', 'resolution', 'award', 'incident', 'media_mention'
    event_title VARCHAR(255),
    event_description TEXT,

    event_date DATE NOT NULL,
    event_time TIME,

    -- Участники и ссылки
    participants TEXT,  -- Список (JSON или простой текст)
    evidence_link VARCHAR(500),
    media_link VARCHAR(500),

    -- Влияние на рейтинг (если есть)
    related_penalty_id SMALLINT,
    related_indicator_id SMALLINT,

    -- Источник
    source_id SMALLINT,

    -- Статус события
    is_public BOOLEAN DEFAULT TRUE,  -- Может ли быть опубликовано
    status VARCHAR(50) DEFAULT 'registered',  -- 'registered', 'confirmed', 'archived', 'disputed'

    -- Служебные поля
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),

    FOREIGN KEY (mo_id) REFERENCES dim_municipalities(mo_id),
    FOREIGN KEY (period_id) REFERENCES dim_period(period_id),
    FOREIGN KEY (source_id) REFERENCES src_registry(source_id),
    FOREIGN KEY (related_penalty_id) REFERENCES dim_penalties(pen_id),
    FOREIGN KEY (related_indicator_id) REFERENCES dim_indicators(ind_id)
);

CREATE INDEX idx_fact_events_mo ON fact_events(mo_id);
CREATE INDEX idx_fact_events_type ON fact_events(event_type);
CREATE INDEX idx_fact_events_date ON fact_events(event_date DESC);
CREATE INDEX idx_fact_events_period ON fact_events(period_id);
CREATE INDEX idx_fact_events_status ON fact_events(status);


-- ============================================================================
-- СЛУЖЕБНАЯ ТАБЛИЦА: Статус загрузки данных (для мониторинга SLA)
-- ============================================================================

DROP TABLE IF EXISTS load_status CASCADE;
CREATE TABLE load_status (
    status_id SERIAL PRIMARY KEY,

    source_id SMALLINT NOT NULL,
    period_id SMALLINT NOT NULL,

    -- Статус
    status VARCHAR(50),  -- 'pending', 'in_progress', 'completed', 'failed', 'overdue'
    expected_date DATE,
    actual_date DATE,

    -- Файл и прогресс
    file_name VARCHAR(255),
    records_expected SMALLINT,
    records_received SMALLINT,
    records_processed SMALLINT,

    -- Ошибки валидации
    validation_errors TEXT,
    error_count SMALLINT,

    -- Служебные
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (source_id) REFERENCES src_registry(source_id),
    FOREIGN KEY (period_id) REFERENCES dim_period(period_id),

    UNIQUE(source_id, period_id)
);

CREATE INDEX idx_load_status_source ON load_status(source_id);
CREATE INDEX idx_load_status_period ON load_status(period_id);
CREATE INDEX idx_load_status_status ON load_status(status);
CREATE INDEX idx_load_status_expected ON load_status(expected_date);


-- ============================================================================
-- ТАБЛИЦА: История расчётов (для отката и отладки)
-- ============================================================================

DROP TABLE IF EXISTS calculation_history CASCADE;
CREATE TABLE calculation_history (
    calc_id SERIAL PRIMARY KEY,

    mo_id SMALLINT,
    period_id SMALLINT,
    version_id VARCHAR(10),

    -- Тип расчёта
    calc_type VARCHAR(100),  -- 'indicator_score', 'public_rating', 'closed_rating', 'total_rating'

    -- Входные данные
    input_data JSONB,

    -- Результаты
    output_data JSONB,

    -- Параметры
    formula_id VARCHAR(255),
    parameters JSONB,

    -- Когда и кем
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    calculated_by VARCHAR(255),

    -- Служебные
    is_final BOOLEAN DEFAULT FALSE,
    notes TEXT
);

CREATE INDEX idx_calc_history_mo ON calculation_history(mo_id);
CREATE INDEX idx_calc_history_period ON calculation_history(period_id);
CREATE INDEX idx_calc_history_version ON calculation_history(version_id);
CREATE INDEX idx_calc_history_date ON calculation_history(calculated_at DESC);


-- ============================================================================
-- ЗАВЕРШЕНИЕ
-- ============================================================================

COMMIT;
