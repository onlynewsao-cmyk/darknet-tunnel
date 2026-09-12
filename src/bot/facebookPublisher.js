const BotConfig = require('../database/models/BotConfig');
const mediaHandler = require('./mediaHandler');
const config = require('../config');

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || 'v20.0';

async function getFbConfig() {
  const pageId = process.env.FB_PAGE_ID || await BotConfig.get('fb_page_id', '');
  const token = process.env.FB_PAGE_ACCESS_TOKEN || await BotConfig.get('fb_page_access_token', '');
  return { pageId: String(pageId || '').trim(), token: String(token || '').trim() };
}

function graphUrl(pageId, edge) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/${edge.replace(/^\//, '')}`;
}

async function postForm(url, fields = {}, file = null) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'undefined' && v !== null && String(v) !== '') fd.append(k, String(v));
  }
  if (file?.buffer) {
    const blob = new Blob([file.buffer], { type: file.type || 'application/octet-stream' });
    fd.append(file.field || 'source', blob, file.name || 'media.bin');
  }
  const res = await fetch(url, { method: 'POST', body: fd });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data?.error) throw new Error(data?.error?.message || text.slice(0, 300));
  return data;
}

async function publishText(message) {
  const { pageId, token } = await getFbConfig();
  if (!pageId || !token) throw new Error('FB_PAGE_ID/FB_PAGE_ACCESS_TOKEN não configurados');
  return postForm(graphUrl(pageId, 'feed'), { message, access_token: token });
}

async function publishPhoto({ caption = '', url = '', buffer = null, fileName = 'dark-photo.jpg' }) {
  const { pageId, token } = await getFbConfig();
  if (!pageId || !token) throw new Error('FB_PAGE_ID/FB_PAGE_ACCESS_TOKEN não configurados');
  const fields = { caption, access_token: token };
  if (url) fields.url = url;
  const file = buffer ? { field: 'source', buffer, name: fileName, type: 'image/jpeg' } : null;
  return postForm(graphUrl(pageId, 'photos'), fields, file);
}

async function publishVideo({ description = '', url = '', buffer = null, fileName = 'dark-video.mp4' }) {
  const { pageId, token } = await getFbConfig();
  if (!pageId || !token) throw new Error('FB_PAGE_ID/FB_PAGE_ACCESS_TOKEN não configurados');
  const fields = { description, access_token: token };
  if (url) fields.file_url = url;
  const file = buffer ? { field: 'source', buffer, name: fileName, type: 'video/mp4' } : null;
  return postForm(graphUrl(pageId, 'videos'), fields, file);
}

async function publishPhotoStory({ caption = '', url = '', buffer = null, fileName = 'dark-story.jpg' }) {
  const { pageId, token } = await getFbConfig();
  if (!pageId || !token) throw new Error('FB_PAGE_ID/FB_PAGE_ACCESS_TOKEN não configurados');
  const photo = await publishPhoto({ caption, url, buffer, fileName });
  const photoId = photo.id || photo.post_id;
  if (!photoId) return photo;
  try {
    return await postForm(graphUrl(pageId, 'photo_stories'), { photo_id: photoId, access_token: token });
  } catch (e) {
    return { ...photo, storyWarning: e.message };
  }
}

async function publishVideoStory({ description = '', url = '', buffer = null, fileName = 'dark-story.mp4' }) {
  const { pageId, token } = await getFbConfig();
  if (!pageId || !token) throw new Error('FB_PAGE_ID/FB_PAGE_ACCESS_TOKEN não configurados');
  const video = await publishVideo({ description, url, buffer, fileName });
  const videoId = video.id;
  if (!videoId) return video;
  try {
    return await postForm(graphUrl(pageId, 'video_stories'), { video_id: videoId, access_token: token });
  } catch (e) {
    return { ...video, storyWarning: e.message };
  }
}

function resultLink(data) {
  if (!data) return '';
  const id = data.post_id || data.id || data.success;
  return id ? `https://facebook.com/${id}` : '';
}

module.exports = {
  getFbConfig,
  publishText,
  publishPhoto,
  publishVideo,
  publishPhotoStory,
  publishVideoStory,
  resultLink,
};
