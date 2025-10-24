// Main JavaScript for Autonomera777 Parser

document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ Parser dashboard loaded');

  // Add event listeners if needed
  initializeEventListeners();
});

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
  // Add click handlers for operation cards
  const operationCards = document.querySelectorAll('.operation-card');
  operationCards.forEach(card => {
    card.addEventListener('click', function() {
      const link = this.querySelector('a');
      if (link) {
        window.location.href = link.href;
      }
    });
  });

  // Check server health on page load
  checkServerHealth();
}

/**
 * Check server health
 */
async function checkServerHealth() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) {
      console.warn('⚠️ Server health check failed');
      return;
    }

    const data = await response.json();
    console.log('🏥 Server Health:', data);

    // Update server status badge if it exists
    const statusBadge = document.querySelector('.status-badge');
    if (statusBadge) {
      statusBadge.textContent = `✓ Server Active (${data.activeSessions} sessions)`;
      statusBadge.style.background = '#4caf50';
    }
  } catch (error) {
    console.error('❌ Error checking server health:', error);
  }
}

/**
 * Fetch active sessions
 */
async function fetchSessions() {
  try {
    const response = await fetch('/api/sessions');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const sessions = await response.json();
    console.log('📊 Active Sessions:', sessions);
    return sessions;
  } catch (error) {
    console.error('❌ Error fetching sessions:', error);
    return [];
  }
}

/**
 * Get session status
 */
async function getSessionStatus(sessionId) {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/status`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const status = await response.json();
    console.log(`📍 Session ${sessionId} Status:`, status);
    return status;
  } catch (error) {
    console.error(`❌ Error fetching session status:`, error);
    return null;
  }
}

/**
 * Start parsing
 */
async function startParsing(options = {}) {
  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        minPrice: options.minPrice || 0,
        maxPrice: options.maxPrice || Infinity,
        region: options.region || null,
        maxPages: options.maxPages || 50,
        delayMs: options.delayMs || 1000
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('🚀 Parsing started:', data);
    return data;
  } catch (error) {
    console.error('❌ Error starting parsing:', error);
    return null;
  }
}

/**
 * Export session data
 */
async function exportSessionData(sessionId, format = 'json') {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/export?format=${format}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${sessionId}.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    console.log(`💾 Data exported as ${format}`);
  } catch (error) {
    console.error('❌ Error exporting data:', error);
  }
}

// Export functions for global use
window.ParserAPI = {
  checkHealth: checkServerHealth,
  fetchSessions: fetchSessions,
  getSessionStatus: getSessionStatus,
  startParsing: startParsing,
  exportData: exportSessionData
};
