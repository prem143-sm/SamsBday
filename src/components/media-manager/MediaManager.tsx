import { useState, useCallback, useEffect } from 'react';
import {
  authenticateBirthday,
  signOut,
  listMedia,
  uploadMedia,
  deleteMedia,
  type AuthUser,
  type MediaItem,
} from '@/src/lib/auth-client';
import { convertImageToWebP, formatFileSize, computeSavings } from '@/src/lib/image-converter';

const MAX_UPLOAD_SIZE_MB = 100;
const SUPPORTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/webm'];
const SUPPORTED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/gif', 'image/avif', 'image/heic', 'image/heif'];

type View = 'auth' | 'upload' | 'library';
type MediaTab = 'music' | 'photos';

function formatDob(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('-');
}

function isValidDob(value: string): boolean {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) return false;
  const [day, month, year] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

interface MediaManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MediaManager({ isOpen, onClose }: MediaManagerProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [view, setView] = useState<View>('auth');
  const [activeTab, setActiveTab] = useState<MediaTab>('music');
  const [musicPlaylist, setMusicPlaylist] = useState<'sams-playlist' | 'prems-playlist'>('sams-playlist');
  const [samDob, setSamDob] = useState('');
  const [premDob, setPremDob] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Upload state
  const [uploadMediaType, setUploadMediaType] = useState<'audio' | 'photo'>('audio');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ loaded: 0, total: 0 });
  const [uploadResults, setUploadResults] = useState<{ ok: boolean; file?: string; error?: string }[]>([]);
  const [conversionResults, setConversionResults] = useState<any[]>([]);
  const [converting, setConverting] = useState(false);

  // Library state
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ title: string; artist?: string }>({ title: '', artist: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: 'info' as 'info' | 'success' | 'error' });

  const loadMedia = useCallback(async () => {
    if (!user) return;
    setLibraryLoading(true);
    try {
      const items = await listMedia(activeTab === 'music' ? 'audio' : 'photo', activeTab === 'music' ? musicPlaylist : undefined);
      setMediaItems(items);
    } catch {
      setStatusMessage({ text: 'Failed to load media library.', type: 'error' });
    } finally {
      setLibraryLoading(false);
    }
  }, [user, activeTab, musicPlaylist]);

  useEffect(() => {
    if (isOpen && user && view === 'library') loadMedia();
  }, [isOpen, user, view, loadMedia]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidDob(samDob) || !isValidDob(premDob)) {
      setAuthError('Please enter both valid DOBs.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await authenticateBirthday(samDob, premDob);
      if (res.ok && res.user) {
        setUser(res.user);
        setView('library');
        setSamDob('');
        setPremDob('');
      } else {
        setAuthError(res.error || 'The details could not be verified. Please try again.');
      }
    } catch {
      setAuthError('The details could not be verified. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleClose = async () => {
    // Closing the private area locks it. A new Manage Media visit must show
    // the two-DOB authorization form instead of restoring an old session.
    await signOut();
    setSamDob('');
    setPremDob('');
    setAuthError('');
    setUser(null);
    setView('auth');
    setMediaItems([]);
    onClose();
  };

  const handleSignOut = async () => {
    await handleClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (uploadMediaType === 'audio' && files.length > 10) {
      setStatusMessage({ text: 'Choose up to 10 songs at a time.', type: 'error' });
      e.target.value = '';
      return;
    }
    setSelectedFiles(files);
    if (uploadMediaType === 'photo') {
      setConversionResults([]);
    } else {
      setUploadResults([]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (uploadMediaType === 'audio' && files.length > 10) {
      setStatusMessage({ text: 'Choose up to 10 songs at a time.', type: 'error' });
      return;
    }
    setSelectedFiles(files);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    if (uploadMediaType === 'photo') {
      setConversionResults((prev) => prev.filter((_, i) => i !== index));
    } else {
      setUploadResults((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadResults([]);

    if (uploadMediaType === 'photo') {
      await handlePhotoUpload();
    } else {
      await handleAudioUpload();
    }

    setUploading(false);
    setSelectedFiles([]);
    if (user) loadMedia();
  };

  const handleAudioUpload = async () => {
    const results = await uploadMedia('audio', selectedFiles, musicPlaylist, (loaded, total) => {
      setUploadProgress({ loaded, total });
    });

    const formatted = results.map((r) => ({
      ok: r.ok,
      file: r.media?.title,
      error: r.error,
    }));
    setUploadResults(formatted);

    const hasError = results.some((r) => !r.ok);
    setStatusMessage({
      text: hasError
        ? `Upload completed with ${results.filter((r) => !r.ok).length} failure(s).`
        : `Successfully uploaded ${results.length} track(s).`,
      type: hasError ? 'error' : 'success',
    });
  };

  const handlePhotoUpload = async () => {
    setConverting(true);
    setConversionResults([]);
    const uploadResults = await uploadMedia('photo', selectedFiles, undefined, (loaded, total) => {
      setUploadProgress({ loaded, total });
    });

    setConverting(false);

    const formatted = uploadResults.map((r) => ({
      ok: r.ok,
      file: r.media?.title,
      error: r.error,
    }));
    setUploadResults(formatted);

    const hasError = uploadResults.some((r) => !r.ok);
    setStatusMessage({
      text: hasError
        ? `Photo upload completed with ${uploadResults.filter((r) => !r.ok).length} failure(s).`
        : `Successfully converted and uploaded ${uploadResults.length} photo(s) as WebP.`,
      type: hasError ? 'error' : 'success',
    });
  };

  const handleEditSave = async () => {
    // Edit metadata would require a PATCH endpoint; for now just close
    setEditId(null);
  };

  const handleDelete = async (item: MediaItem) => {
    const res = await deleteMedia(item.sourceType === 'uploaded_audio' ? 'audio' : 'photo', item.storageKey, item.sourceType === 'uploaded_audio' ? musicPlaylist : undefined);
    if (res.ok) {
      setMediaItems((prev) => prev.filter((entry) => entry.id !== item.id));
      setStatusMessage({ text: 'Media deleted successfully.', type: 'success' });
      if (user) loadMedia();
    } else {
      setStatusMessage({ text: res.error || 'Failed to delete media.', type: 'error' });
    }
    setDeleteConfirmId(null);
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="media-manager" role="dialog" aria-modal="true" aria-label="Media Management">
      <div className="media-overlay" onClick={handleClose} />
      <div className="media-panel">
        <header className="media-header">
          <div className="media-header-left">
            <h2>Manage Media</h2>
            <p>{user ? `Authenticated as ${user.name}` : 'Sign in to manage media'}</p>
          </div>
          <button type="button" onClick={handleClose} className="media-close" aria-label="Close">
            ×
          </button>
        </header>

        {view === 'auth' && (
          <section className="media-auth">
            <div className="auth-card">
              <h3>Authentication Required</h3>
              <p className="auth-hint">Enter both birthday dates to unlock media management.</p>
              <form onSubmit={handleAuth} className="auth-form">
                <div className="auth-field">
                  <label htmlFor="sam-dob">S&#39;s DOB <span className="auth-format">(DD-MM-YYYY)</span></label>
                  <input id="sam-dob" type="text" value={samDob} onChange={(event) => setSamDob(formatDob(event.target.value))} placeholder="DD-MM-YYYY" maxLength={10} inputMode="numeric" autoComplete="off" autoFocus />
                </div>
                <div className="auth-field">
                  <label htmlFor="prem-dob">P&#39;s DOB <span className="auth-format">(DD-MM-YYYY)</span></label>
                  <input id="prem-dob" type="text" value={premDob} onChange={(event) => setPremDob(formatDob(event.target.value))} placeholder="DD-MM-YYYY" maxLength={10} inputMode="numeric" autoComplete="off" />
                </div>
                {authError && <p className="auth-error" role="alert">{authError}</p>}
                <button type="submit" className="auth-submit" disabled={authLoading}>
                  {authLoading ? 'Verifying...' : 'Unlock Media Management'}
                </button>
              </form>
              <p className="auth-security">
                Protected media area. Both dates are verified server-side.
              </p>
            </div>
          </section>
        )}

        {view === 'upload' && (
          <section className="media-upload">
            <div className="upload-nav">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'music' ? 'active' : ''}`}
                onClick={() => { setActiveTab('music'); setUploadMediaType('audio'); setSelectedFiles([]); }}
              >
                ♪ Music
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'photos' ? 'active' : ''}`}
                onClick={() => { setActiveTab('photos'); setUploadMediaType('photo'); setSelectedFiles([]); }}
              >
                📷 Photos
              </button>
              <button type="button" onClick={() => setView('library')} className="back-btn">
                ← Back to Library
              </button>
            </div>

            <div className="upload-card">
              {activeTab === 'music' ? (
                <div>
                  <h3>Upload Music</h3>
                  <p>Choose the playlist, then add up to 10 songs. Supported: MP3, WAV, M4A, AAC, OGG, FLAC (max 100 MB each)</p>
                  <div className="playlist-choice" role="group" aria-label="Choose playlist for uploaded songs">
                    <button type="button" className={musicPlaylist === 'sams-playlist' ? 'active' : ''} onClick={() => setMusicPlaylist('sams-playlist')}>Sam&#39;s Playlist</button>
                    <button type="button" className={musicPlaylist === 'prems-playlist' ? 'active' : ''} onClick={() => setMusicPlaylist('prems-playlist')}>Prem&#39;s Playlist</button>
                  </div>
                  <div className="drop-zone" onDragOver={handleDragOver} onDrop={handleDrop}>
                    <p className="drop-text">Drop your music here</p>
                    <p className="drop-sub">or browse files from your device</p>
                    <button type="button" className="browse-btn" onClick={() => {
                      const input = document.getElementById('audio-file-input') as HTMLInputElement;
                      input?.click();
                    }}>
                      Browse Files
                    </button>
                    <input
                      id="audio-file-input"
                      type="file"
                      multiple
                      accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <h3>Upload Photos</h3>
                  <p>Supported: JPEG, PNG, BMP, GIF, AVIF, HEIC — automatically converted to WebP</p>
                  <div className="drop-zone" onDragOver={handleDragOver} onDrop={handleDrop}>
                    <p className="drop-text">Drop your photos here</p>
                    <p className="drop-sub">or browse files from your device</p>
                    <button type="button" className="browse-btn" onClick={() => {
                      const input = document.getElementById('photo-file-input') as HTMLInputElement;
                      input?.click();
                    }}>
                      Browse Files
                    </button>
                    <input
                      id="photo-file-input"
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.bmp,.gif,.avif,.heic,.heif,.webp"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
              )}

              {selectedFiles.length > 0 && (
                <div className="file-list">
                  <h4>Selected Files ({selectedFiles.length})</h4>
                  {selectedFiles.map((file, i) => {
                    const sizeInfo = activeTab === 'photos' && conversionResults[i]
                      ? `Original: ${formatFileSize(file.size)} → Converted: ${formatFileSize(conversionResults[i].convertedSize ?? 0)}`
                      : `${formatFileSize(file.size)}`;
                    return (
                      <div key={file.name + i} className="file-item">
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{sizeInfo}</span>
                        <button type="button" onClick={() => removeFile(i)} className="file-remove">×</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === 'photos' && conversionResults.length > 0 && (
                <div className="conversion-summary">
                  <h4>Conversion Results</h4>
                  {conversionResults.map((r, i) => (
                    <div key={r.fileName + i} className="conversion-item">
                      <span className="conv-name">{r.fileName}</span>
                      {r.error ? (
                        <span className="conv-error">✗ {r.error}</span>
                      ) : (
                        <>
                          <span className="conv-size">
                            {formatFileSize(r.originalSize)} → {formatFileSize(r.convertedSize ?? 0)}
                          </span>
                          {r.wasAnimated && <span className="conv-animated">(first frame only)</span>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {uploadProgress.total > 0 && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(uploadProgress.loaded / uploadProgress.total) * 100}%` }} />
                </div>
              )}

              {uploadResults.length > 0 && (
                <div className="upload-results">
                  {uploadResults.map((r, i) => (
                    <div key={i} className={`result-item ${r.ok ? 'result-success' : 'result-error'}`}>
                      {r.ok ? '✓' : '✗'} {r.file || r.error}
                    </div>
                  ))}
                </div>
              )}

              <div className="upload-actions">
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading || selectedFiles.length === 0}
                  className="upload-btn"
                >
                  {uploading ? 'Processing...' : 'Upload Selected Files'}
                </button>
              </div>
            </div>
          </section>
        )}

        {view === 'library' && (
          <section className="media-library">
            <div className="library-nav">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'music' ? 'active' : ''}`}
                onClick={() => setActiveTab('music')}
              >
                ♪ Music Library
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'photos' ? 'active' : ''}`}
                onClick={() => setActiveTab('photos')}
              >
                📷 Photo Library
              </button>
              <button type="button" onClick={() => setView('upload')} className="add-btn">
                + Add Media
              </button>
            </div>

            {activeTab === 'music' && (
              <div className="playlist-choice library-playlist-choice" role="group" aria-label="Choose playlist to manage">
                <button type="button" className={musicPlaylist === 'sams-playlist' ? 'active' : ''} onClick={() => setMusicPlaylist('sams-playlist')}>Sam&#39;s Playlist</button>
                <button type="button" className={musicPlaylist === 'prems-playlist' ? 'active' : ''} onClick={() => setMusicPlaylist('prems-playlist')}>Prem&#39;s Playlist</button>
              </div>
            )}

            <div className="library-summary">
              <div className="summary-card">
                <span className="summary-label">{activeTab === 'music' ? 'Songs' : 'Photos'}</span>
                <span className="summary-value">{mediaItems.length}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Total Size</span>
                <span className="summary-value">
                  {formatFileSize(mediaItems.reduce((sum, item) => sum + item.fileSize, 0))}
                </span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Collection</span>
                <span className="summary-value">{user?.name === 'Sam' ? "Sam's Collection" : "Prem's Collection"}</span>
              </div>
            </div>

            {statusMessage.text && (
              <p className={`status-message ${statusMessage.type}`} role="status">{statusMessage.text}</p>
            )}

            {libraryLoading ? (
              <p className="library-empty">Loading media library...</p>
            ) : mediaItems.length === 0 ? (
              <div className="library-empty">
                <p>No {activeTab === 'music' ? 'songs' : 'photos'} here yet.</p>
                <p>Add your first {activeTab === 'music' ? 'track' : 'photo'} to get started.</p>
              </div>
            ) : (
              <div className="media-grid">
                {mediaItems.map((item) => (
                  <div key={item.id} className="media-item">
                    <div className="media-preview">
                      {item.sourceType === 'uploaded_photo' ? (
                        <img src={item.url} alt={item.title} className="media-thumb" />
                      ) : (
                        <div className="media-audio-icon">♪</div>
                      )}
                      <div className="media-item-actions">
                        {editId === item.id ? (
                          <>
                            <input
                              type="text"
                              value={editValues.title}
                              onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                              className="edit-input"
                            />
                            {item.sourceType === 'uploaded_audio' && (
                              <input
                                type="text"
                                value={editValues.artist ?? ''}
                                onChange={(e) => setEditValues({ ...editValues, artist: e.target.value })}
                                className="edit-input"
                                placeholder="Artist"
                              />
                            )}
                            <button type="button" onClick={handleEditSave} className="edit-save">Save</button>
                            <button type="button" onClick={() => setEditId(null)} className="edit-cancel">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => {
                              setEditId(item.id);
                              setEditValues({ title: item.title, artist: item.artist });
                            }} className="media-btn edit">Edit</button>
                            <button type="button" onClick={() => setDeleteConfirmId(item.id)} className="media-btn delete">Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="media-info">
                      <div className="media-title" title={item.title}>{item.title}</div>
                      {item.artist && <div className="media-artist">{item.artist}</div>}
                      <div className="media-meta">
                        <span>{formatFileSize(item.fileSize)}</span>
                        {item.sourceType === 'uploaded_audio' && <span>· {formatDuration(item.duration)}</span>}
                        <span>· {new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {deleteConfirmId !== null && (
              <div className="confirm-dialog">
                <p>Delete this media item permanently? This cannot be undone.</p>
                <div className="confirm-actions">
                  <button type="button" onClick={() => setDeleteConfirmId(null)} className="confirm-cancel">Cancel</button>
                  <button type="button" onClick={() => {
                    const item = mediaItems.find((entry) => entry.id === deleteConfirmId);
                    if (item) handleDelete(item);
                  }} className="confirm-delete">Delete Permanently</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
import './MediaManager.css';
