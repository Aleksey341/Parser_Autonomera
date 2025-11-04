/**
 * ============================================================================
 * API Маршруты: Карта (Choropleth) с данными МО
 * GET /api/map - получить свод данных всех МО для рендеринга карты
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const pool = require('../db/postgres');

/**
 * GET /api/map?period=YYYY-MM&version=v1&colorBy=total_score|completion
 * Возвращает данные всех МО с баллами и геометрией для хлороплеты
 */
router.get('/', async (req, res) => {
  try {
    const { period = '202406', version = 'v1', colorBy = 'total_score' } = req.query;

    // Переводим период из YYYYMM в period_id
    const periodId = parseInt(period);

    // Получаем все МО с их рейтингами
    const query = `
      SELECT
        m.mo_id,
        m.mo_name,
        m.mo_name_short,
        m.oktmo,
        m.lat,
        m.lon,
        m.geojson_id,
        m.population,
        m.area_km2,
        r.score_public,
        r.score_closed,
        r.score_penalties,
        r.score_total,
        r.zone,
        r.completion_rate,
        r.indicators_filled_count,
        r.indicators_total_count,
        COALESCE(p.penalty_count, 0) as active_penalties
      FROM dim_municipalities m
      LEFT JOIN fact_summary_ratings r ON m.mo_id = r.mo_id
        AND r.period_id = $1 AND r.version_id = $2
      LEFT JOIN (
        SELECT mo_id, COUNT(*) as penalty_count
        FROM fact_penalties
        WHERE period_id = $1 AND version_id = $2 AND status = 'active'
        GROUP BY mo_id
      ) p ON m.mo_id = p.mo_id
      WHERE m.is_active = TRUE
      ORDER BY m.mo_id
    `;

    const result = await pool.query(query, [periodId, version]);

    // Структурируем ответ для фронтенда
    const municipalities = result.rows.map(row => {
      // Определяем цвет в зависимости от colorBy
      let colorValue = 0;
      let colorLabel = '';

      if (colorBy === 'completion') {
        colorValue = row.completion_rate || 0;
        colorLabel = `${(colorValue * 100).toFixed(0)}%`;
      } else {
        colorValue = row.score_total || 0;
        colorLabel = colorValue.toFixed(1);
      }

      return {
        mo_id: row.mo_id,
        name: row.mo_name,
        name_short: row.mo_name_short,
        oktmo: row.oktmo,
        coords: {
          lat: parseFloat(row.lat),
          lon: parseFloat(row.lon)
        },
        geojson_id: row.geojson_id,
        population: row.population,
        area: row.area_km2,
        rating: {
          score_total: row.score_total,
          score_public: row.score_public,
          score_closed: row.score_closed,
          score_penalties: row.score_penalties,
          zone: row.zone || 'unknown'
        },
        completion: {
          rate: (row.completion_rate || 0) * 100,
          filled: row.indicators_filled_count || 0,
          total: row.indicators_total_count || 0
        },
        warnings: {
          active_penalties: row.active_penalties > 0,
          penalty_count: row.active_penalties || 0
        },
        color_value: colorValue,
        color_label: colorLabel
      };
    });

    // Получаем информацию о периоде
    const periodInfo = await pool.query(
      'SELECT period_type, date_from, date_to, description FROM dim_period WHERE period_id = $1',
      [periodId]
    );

    // Получаем легенду цветов
    const legend = await pool.query(
      `SELECT zone_name, color_hex, threshold_min, threshold_max
       FROM map_scale
       WHERE version_id = $1 AND zone_name IS NOT NULL
       ORDER BY threshold_min`,
      [version]
    );

    const colorScheme = legend.rows.map(row => ({
      zone: row.zone_name,
      color: row.color_hex,
      min: row.threshold_min,
      max: row.threshold_max,
      label: `${row.threshold_min.toFixed(0)}-${row.threshold_max.toFixed(0)} баллов`
    }));

    // Рассчитываем статистику
    const scores = municipalities.map(m => m.rating.score_total).filter(s => s);
    const stats = {
      total_mo: municipalities.length,
      average_score: scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0,
      min_score: scores.length > 0 ? Math.min(...scores).toFixed(1) : 0,
      max_score: scores.length > 0 ? Math.max(...scores).toFixed(1) : 0,
      zones: {
        green: municipalities.filter(m => m.rating.zone === 'green').length,
        yellow: municipalities.filter(m => m.rating.zone === 'yellow').length,
        red: municipalities.filter(m => m.rating.zone === 'red').length,
        unknown: municipalities.filter(m => !m.rating.zone || m.rating.zone === 'unknown').length
      }
    };

    res.json({
      success: true,
      period: {
        id: periodId,
        type: periodInfo.rows[0]?.period_type,
        date_from: periodInfo.rows[0]?.date_from,
        date_to: periodInfo.rows[0]?.date_to,
        description: periodInfo.rows[0]?.description
      },
      version: version,
      color_by: colorBy,
      municipalities: municipalities,
      legend: colorScheme,
      statistics: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка в GET /api/map:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      detail: error.detail
    });
  }
});

/**
 * GET /api/map/top-bottom?period=YYYY-MM&version=v1
 * Возвращает TOP-5 лучших и 5 худших МО по рейтингу
 */
router.get('/top-bottom', async (req, res) => {
  try {
    const { period = '202406', version = 'v1', limit = 5 } = req.query;
    const periodId = parseInt(period);
    const limitNum = Math.min(parseInt(limit), 10);

    const query = `
      SELECT
        m.mo_id,
        m.mo_name,
        r.score_total,
        r.zone
      FROM dim_municipalities m
      JOIN fact_summary_ratings r ON m.mo_id = r.mo_id
        AND r.period_id = $1 AND r.version_id = $2
      WHERE m.is_active = TRUE AND r.score_total IS NOT NULL
      ORDER BY r.score_total DESC
    `;

    const result = await pool.query(query, [periodId, version]);

    const top = result.rows.slice(0, limitNum).map((row, idx) => ({
      rank: idx + 1,
      mo_id: row.mo_id,
      name: row.mo_name,
      score: row.score_total,
      zone: row.zone
    }));

    const bottom = result.rows.slice(-limitNum).reverse().map((row, idx) => ({
      rank: result.rows.length - idx,
      mo_id: row.mo_id,
      name: row.mo_name,
      score: row.score_total,
      zone: row.zone
    }));

    res.json({
      success: true,
      period: periodId,
      top: top,
      bottom: bottom,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка в GET /api/map/top-bottom:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/map/stats?period=YYYY-MM&version=v1
 * Расширенная статистика по результатам периода
 */
router.get('/stats', async (req, res) => {
  try {
    const { period = '202406', version = 'v1' } = req.query;
    const periodId = parseInt(period);

    const ratingsResult = await pool.query(
      `SELECT zone, COUNT(*) as count, AVG(score_total) as avg_score
       FROM fact_summary_ratings
       WHERE period_id = $1 AND version_id = $2
       GROUP BY zone`,
      [periodId, version]
    );

    const penaltyResult = await pool.query(
      `SELECT COUNT(DISTINCT mo_id) as mo_with_penalties
       FROM fact_penalties
       WHERE period_id = $1 AND version_id = $2 AND status = 'active'`,
      [periodId, version]
    );

    const completionResult = await pool.query(
      `SELECT AVG(completion_rate) as avg_completion
       FROM fact_summary_ratings
       WHERE period_id = $1 AND version_id = $2`,
      [periodId, version]
    );

    res.json({
      success: true,
      period: periodId,
      by_zone: ratingsResult.rows,
      municipalities_with_penalties: penaltyResult.rows[0]?.mo_with_penalties || 0,
      average_completion_rate: (completionResult.rows[0]?.avg_completion || 0) * 100,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Ошибка в GET /api/map/stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
