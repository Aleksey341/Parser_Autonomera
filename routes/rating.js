/**
 * ============================================================================
 * API Маршруты: Таблица рейтинга
 * GET /api/rating - список всех МО с сортировкой и фильтрацией
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const pool = require('../db/postgres');

/**
 * GET /api/rating?period=YYYY-MM&version=v1&sort=score_total&order=DESC&zone=green&page=1&limit=20
 * Возвращает таблицу рейтинга МО с возможностью фильтрации и сортировки
 */
router.get('/', async (req, res) => {
  try {
    const {
      period = '202406',
      version = 'v1',
      sort = 'score_total',
      order = 'DESC',
      zone = null,
      page = 1,
      limit = 20
    } = req.query;

    const periodId = parseInt(period);
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const offset = (pageNum - 1) * limitNum;

    // Валидация sort (защита от SQL injection)
    const validSortFields = ['score_total', 'score_public', 'zone', 'completion_rate'];
    const sortField = validSortFields.includes(sort) ? sort : 'score_total';
    const orderDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Строим основной запрос
    let whereCondition = `r.period_id = $1 AND r.version_id = $2`;
    const params = [periodId, version];

    if (zone) {
      whereCondition += ` AND r.zone = $3`;
      params.push(zone);
    }

    const query = `
      SELECT
        m.mo_id,
        m.mo_name,
        m.mo_type,
        m.population,
        r.score_public,
        r.score_closed,
        r.score_penalties,
        r.score_total,
        r.zone,
        r.completion_rate,
        r.indicators_filled_count,
        r.indicators_total_count,
        COALESCE(p.penalty_count, 0) as active_penalty_count,
        CASE WHEN r.score_total > LAG(r.score_total) OVER (ORDER BY r.score_total) THEN 'up'
             WHEN r.score_total < LAG(r.score_total) OVER (ORDER BY r.score_total) THEN 'down'
             ELSE 'stable' END as trend
      FROM dim_municipalities m
      JOIN fact_summary_ratings r ON m.mo_id = r.mo_id
      LEFT JOIN (
        SELECT mo_id, COUNT(*) as penalty_count
        FROM fact_penalties
        WHERE period_id = $1 AND version_id = $2 AND status = 'active'
        GROUP BY mo_id
      ) p ON m.mo_id = p.mo_id
      WHERE ${whereCondition} AND m.is_active = TRUE
      ORDER BY ${sortField} ${orderDir}, m.mo_id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limitNum, offset);

    const result = await pool.query(query, params);

    // Получаем общее количество записей для пагинации
    let countQuery = `
      SELECT COUNT(*) as total
      FROM dim_municipalities m
      JOIN fact_summary_ratings r ON m.mo_id = r.mo_id
      WHERE ${whereCondition} AND m.is_active = TRUE
    `;

    const countParams = [periodId, version];
    if (zone) countParams.push(zone);

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limitNum);

    // Структурируем рейтинг с рангами
    const ranking = result.rows.map((row, idx) => ({
      rank: offset + idx + 1,
      mo_id: row.mo_id,
      name: row.mo_name,
      type: row.mo_type,
      population: row.population,
      rating: {
        public: row.score_public,
        closed: row.score_closed,
        penalties: row.score_penalties,
        total: row.score_total,
        zone: row.zone
      },
      completion: {
        rate: (row.completion_rate || 0) * 100,
        filled: row.indicators_filled_count,
        total: row.indicators_total_count
      },
      warnings: {
        penalties: row.active_penalty_count > 0,
        penalty_count: row.active_penalty_count
      },
      trend: row.trend
    }));

    res.json({
      success: true,
      period: periodId,
      version: version,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        total_pages: totalPages
      },
      filters: {
        sort_by: sortField,
        order: orderDir,
        zone: zone || 'all'
      },
      ranking: ranking,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка в GET /api/rating:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rating/compare?period=YYYY-MM&mo_ids=1,2,3&version=v1
 * Сравнение выбранных МО по всем показателям
 */
router.get('/compare', async (req, res) => {
  try {
    const { period = '202406', mo_ids = '1,2,3', version = 'v1' } = req.query;
    const periodId = parseInt(period);

    // Парсим IDs МО
    const moArray = mo_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (moArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Не переданы ID муниципалитетов'
      });
    }

    if (moArray.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Можно сравнивать не более 5 МО'
      });
    }

    // Получаем данные по выбранным МО
    const query = `
      SELECT
        m.mo_id,
        m.mo_name,
        r.score_public,
        r.score_closed,
        r.score_penalties,
        r.score_total,
        r.zone,
        r.completion_rate
      FROM dim_municipalities m
      JOIN fact_summary_ratings r ON m.mo_id = r.mo_id
        AND r.period_id = $1 AND r.version_id = $2
      WHERE m.mo_id = ANY($3)
      ORDER BY r.score_total DESC
    `;

    const result = await pool.query(query, [periodId, version, moArray]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'МО не найдены'
      });
    }

    // Получаем детальные показатели для каждого МО
    const comparison = [];
    for (const mo of result.rows) {
      const indResult = await pool.query(
        `SELECT ind_code, score FROM fact_indicator_values
         WHERE mo_id = $1 AND period_id = $2 AND version_id = $3
         ORDER BY ind_id`,
        [mo.mo_id, periodId, version]
      );

      const indicators = {};
      for (const ind of indResult.rows) {
        indicators[ind.ind_code] = ind.score || 0;
      }

      comparison.push({
        mo_id: mo.mo_id,
        name: mo.mo_name,
        scores: {
          public: mo.score_public,
          closed: mo.score_closed,
          penalties: mo.score_penalties,
          total: mo.score_total
        },
        zone: mo.zone,
        completion: (mo.completion_rate || 0) * 100,
        indicators: indicators
      });
    }

    res.json({
      success: true,
      period: periodId,
      version: version,
      comparison_data: comparison,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка в GET /api/rating/compare:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rating/search?q=липецк&period=YYYY-MM&version=v1
 * Поиск МО по названию
 */
router.get('/search', async (req, res) => {
  try {
    const { q = '', period = '202406', version = 'v1' } = req.query;
    const periodId = parseInt(period);

    if (q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Поисковый запрос должен быть минимум 2 символа'
      });
    }

    const query = `
      SELECT
        m.mo_id,
        m.mo_name,
        m.mo_type,
        r.score_total,
        r.zone
      FROM dim_municipalities m
      LEFT JOIN fact_summary_ratings r ON m.mo_id = r.mo_id
        AND r.period_id = $1 AND r.version_id = $2
      WHERE m.is_active = TRUE AND m.mo_name ILIKE $3
      ORDER BY m.mo_name
    `;

    const result = await pool.query(query, [periodId, version, `%${q}%`]);

    const results = result.rows.map(row => ({
      mo_id: row.mo_id,
      name: row.mo_name,
      type: row.mo_type,
      score: row.score_total,
      zone: row.zone
    }));

    res.json({
      success: true,
      query: q,
      period: periodId,
      count: results.length,
      results: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка в GET /api/rating/search:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
