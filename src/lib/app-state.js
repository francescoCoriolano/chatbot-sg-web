/**
 * App State Module
 * Centralized state management for the application
 * Using CommonJS format for compatibility with server.js
 */

// Module-level variables
let _socketIO = undefined;
let _httpServer = undefined;
let _connectionCount = 0;
let _slackApp = undefined;
const _userChannels = {};
const _slackUserIds = {};
const _recentMessages = {
  chat_message: [],
  slack_message: [],
};

// Maximum number of messages to keep
const MAX_RECENT_MESSAGES = 50;

// Socket IO
function getSocketIO() {
  return _socketIO;
}

function setSocketIO(io) {
  _socketIO = io;
}

// HTTP Server
function getHttpServer() {
  return _httpServer;
}

function setHttpServer(server) {
  _httpServer = server;
}

// Connection Count
function getConnectionCount() {
  return _connectionCount;
}

function setConnectionCount(count) {
  _connectionCount = count;
}

function incrementConnectionCount() {
  return ++_connectionCount;
}

function decrementConnectionCount() {
  return --_connectionCount;
}

// Slack App
function getSlackApp() {
  return _slackApp;
}

function setSlackApp(app) {
  _slackApp = app;
}

// User Channels
function getUserChannels() {
  return _userChannels;
}

function setUserChannel(username, channelId) {
  _userChannels[username] = channelId;
}

function getUserChannel(username) {
  return _userChannels[username];
}

// Slack User IDs
function getSlackUserIds() {
  return _slackUserIds;
}

function setSlackUserId(username, slackUserId) {
  _slackUserIds[username] = slackUserId;
}

function getSlackUserId(username) {
  return _slackUserIds[username];
}

// Recent Messages
function getRecentMessages() {
  return _recentMessages;
}

function getChatMessages() {
  return [..._recentMessages.chat_message];
}

function getSlackMessages() {
  return [..._recentMessages.slack_message];
}

function addChatMessage(message) {
  _recentMessages.chat_message.push(message);

  if (_recentMessages.chat_message.length > MAX_RECENT_MESSAGES) {
    _recentMessages.chat_message.shift(); // Remove oldest
  }
}

function addSlackMessage(message) {
  _recentMessages.slack_message.push(message);

  if (_recentMessages.slack_message.length > MAX_RECENT_MESSAGES) {
    _recentMessages.slack_message.shift(); // Remove oldest
  }
}

function removeOldestChatMessage() {
  if (_recentMessages.chat_message.length > 0) {
    _recentMessages.chat_message.shift();
  }
}

function removeOldestSlackMessage() {
  if (_recentMessages.slack_message.length > 0) {
    _recentMessages.slack_message.shift();
  }
}

// Export module functionality
module.exports = {
  getSocketIO,
  setSocketIO,
  getHttpServer,
  setHttpServer,
  getConnectionCount,
  setConnectionCount,
  incrementConnectionCount,
  decrementConnectionCount,
  getSlackApp,
  setSlackApp,
  getUserChannels,
  setUserChannel,
  getUserChannel,
  getSlackUserIds,
  setSlackUserId,
  getSlackUserId,
  getRecentMessages,
  getChatMessages,
  getSlackMessages,
  addChatMessage,
  addSlackMessage,
  removeOldestChatMessage,
  removeOldestSlackMessage,
};
