import { SessionData, OperatorConfig } from '../types';
import { DEFAULT_OPERATOR_CONFIG } from '../data/defaultConfig';

const SESSIONS_STORAGE_KEY = 'boothpro_sessions_v2';
const CONFIG_STORAGE_KEY = 'boothpro_operator_config_v2';

class StorageService {
  private inMemorySessions: Map<string, SessionData> = new Map();

  constructor() {
    this.loadSessionsFromStorage();
  }

  // Load operator config from localStorage
  public getOperatorConfig(): OperatorConfig {
    try {
      const data = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (data) {
        return { ...DEFAULT_OPERATOR_CONFIG, ...JSON.parse(data) };
      }
    } catch (e) {
      console.warn('[Storage] Failed to read operator config, using defaults');
    }
    return DEFAULT_OPERATOR_CONFIG;
  }

  // Save operator config
  public saveOperatorConfig(config: OperatorConfig): void {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('[Storage] Error saving operator config', e);
    }
  }

  // Load all sessions
  public getAllSessions(): SessionData[] {
    this.loadSessionsFromStorage();
    return Array.from(this.inMemorySessions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // Get session by ID (for public customer soft-file link)
  public getSessionById(sessionId: string): SessionData | undefined {
    if (this.inMemorySessions.has(sessionId)) {
      return this.inMemorySessions.get(sessionId);
    }
    this.loadSessionsFromStorage();
    return this.inMemorySessions.get(sessionId);
  }

  // Save or update session
  public saveSession(session: SessionData): boolean {
    // Validate manifest per Section 10: photo, gif, and video must all be present
    const hasPhoto = Boolean(session.finalPhotoDataUrl && session.finalPhotoDataUrl.length > 50);
    const hasGif = Boolean(session.gifBlobUrl && session.gifBlobUrl.length > 0);
    const hasVideo = Boolean(session.videoBlobUrl && session.videoBlobUrl.length > 0);

    session.manifestValid = hasPhoto && hasGif && hasVideo;

    this.inMemorySessions.set(session.sessionId, session);

    try {
      // Store recent sessions locally as an offline cache.
      const sessionsToStore = Array.from(this.inMemorySessions.values()).slice(0, 30);
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessionsToStore));
      return true;
    } catch (e) {
      console.warn('[Storage] LocalStorage quota reached, persisting in memory', e);
      return true;
    }
  }

  // Delete session
  public deleteSession(sessionId: string): boolean {
    this.inMemorySessions.delete(sessionId);
    try {
      const sessionsToStore = Array.from(this.inMemorySessions.values());
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessionsToStore));
      return true;
    } catch (e) {
      return false;
    }
  }

  private loadSessionsFromStorage() {
    try {
      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (raw) {
        const parsed: SessionData[] = JSON.parse(raw);
        parsed.forEach(s => {
          this.inMemorySessions.set(s.sessionId, s);
        });
      }
    } catch (e) {
      console.warn('[Storage] Error loading sessions from storage', e);
    }
  }

  // This verifies REST endpoint access only; it does not imply data sync is configured.
  public async testCloudConnection(url: string, key: string): Promise<{ success: boolean; message: string }> {
    const baseUrl = url.trim().replace(/\/+$/, '');
    const apiKey = key.trim();

    if (!baseUrl || !apiKey) {
      return {
        success: false,
        message: 'URL atau API Key Supabase belum diisi. Mode offline aktif dengan LocalStorage.',
      };
    }

    try {
      const res = await fetch(`${baseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        cache: 'no-store',
      });

      if (res.ok) {
        return {
          success: true,
          message: 'Endpoint Supabase dapat diakses. Ini belum membuktikan sinkronisasi data aktif.',
        };
      }

      return {
        success: false,
        message: `Tes endpoint Supabase gagal (HTTP ${res.status}). Periksa URL, API key, dan konfigurasi proyek.`,
      };
    } catch {
      return {
        success: false,
        message: 'Endpoint Supabase tidak dapat dijangkau. Periksa koneksi internet dan URL Supabase.',
      };
    }
  }
}

export const storageService = new StorageService();
