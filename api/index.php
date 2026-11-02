<?php
declare(strict_types=1);

/**
 * LeadForge REST API — front controller.
 * All requests are rewritten here by .htaccess (Apache/XAMPP).
 */

use LeadForge\Controllers\AnalyticsController as Analytics;
use LeadForge\Controllers\AuditController as Audit;
use LeadForge\Controllers\AuthController as AuthC;
use LeadForge\Controllers\CrmController as Crm;
use LeadForge\Controllers\DiscoveryController as Discovery;
use LeadForge\Controllers\LeadController as Leads;
use LeadForge\Controllers\NotificationController as Notifications;
use LeadForge\Controllers\WorkspaceController as Workspace;
use LeadForge\Core\Config;
use LeadForge\Core\HttpException;
use LeadForge\Core\Request;
use LeadForge\Core\Response;
use LeadForge\Core\Router;
use LeadForge\Core\Session;

require __DIR__ . '/bootstrap.php';

$isDev = Config::get('app.env') !== 'production';
ini_set('display_errors', '0');
error_reporting(E_ALL);

set_exception_handler(static function (\Throwable $e) use ($isDev): void {
    if ($e instanceof HttpException) Response::error($e->status, $e->getMessage(), $e->errors);
    error_log('[LeadForge] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    @file_put_contents(Config::get('app.storage_path') . '/logs/error.log', gmdate('c') . ' ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine() . "\n", FILE_APPEND);
    if ($e instanceof \PDOException) Response::error(500, $isDev ? 'Database error: ' . $e->getMessage() : 'A database error occurred.');
    Response::error(500, $isDev ? $e->getMessage() : 'An unexpected error occurred.');
});
set_error_handler(static function (int $no, string $str, string $file, int $line): bool {
    if (!(error_reporting() & $no)) return false;
    // Deprecation notices (e.g. on newer PHP versions) must never break a request.
    if (in_array($no, [E_DEPRECATED, E_USER_DEPRECATED], true)) return true;
    throw new \ErrorException($str, 0, $no, $file, $line);
});

// Security headers.
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

// Optional CORS (only needed when the frontend is served from another origin).
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, (array) Config::get('app.cors_origins', []), true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
    header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

Session::start();
$router = new Router();
$public = ['auth' => false];

// --- health & auth
$router->get('/health', fn () => ['status' => 'ok', 'time' => gmdate('c')], $public);
$router->get('/auth/csrf', [AuthC::class, 'csrf'], $public);
$router->post('/auth/register', [AuthC::class, 'register'], $public);
$router->post('/auth/login', [AuthC::class, 'login'], $public);
$router->post('/auth/logout', [AuthC::class, 'logout'], $public);
$router->post('/auth/forgot-password', [AuthC::class, 'forgotPassword'], $public);
$router->post('/auth/reset-password', [AuthC::class, 'resetPassword'], $public);
$router->post('/auth/verify-email', [AuthC::class, 'verifyEmail'], $public);
$router->post('/auth/resend-verification', [AuthC::class, 'resendVerification']);
$router->get('/auth/me', [AuthC::class, 'me']);
$router->patch('/auth/profile', [AuthC::class, 'updateProfile']);
$router->post('/auth/password', [AuthC::class, 'changePassword']);

// --- workspace
$router->get('/workspace', [Workspace::class, 'show']);
$router->patch('/workspace', [Workspace::class, 'update']);
$router->post('/workspace/switch', [Workspace::class, 'switch']);
$router->get('/workspace/scoring', [Workspace::class, 'scoring']);
$router->put('/workspace/scoring', [Workspace::class, 'updateScoring']);
$router->get('/workspace/members', [Workspace::class, 'members']);
$router->post('/workspace/members', [Workspace::class, 'addMember']);
$router->delete('/workspace/members/{id}', [Workspace::class, 'removeMember']);

// --- discovery
$router->get('/discovery/categories', [Discovery::class, 'categories']);
$router->get('/discovery/geocode', [Discovery::class, 'geocode']);
$router->post('/discovery/search', [Discovery::class, 'search']);
$router->get('/businesses', [Discovery::class, 'list']);
$router->post('/businesses/check-websites', [Discovery::class, 'checkBatch']);
$router->get('/businesses/{id}', [Discovery::class, 'show']);
$router->post('/businesses/{id}/check-website', [Discovery::class, 'checkWebsite']);
$router->delete('/businesses/{id}', [Discovery::class, 'delete']);
$router->get('/saved-searches', [Discovery::class, 'savedSearches']);
$router->post('/saved-searches', [Discovery::class, 'createSavedSearch']);
$router->post('/saved-searches/{id}/run', [Discovery::class, 'touchSavedSearch']);
$router->delete('/saved-searches/{id}', [Discovery::class, 'deleteSavedSearch']);

// --- leads
$router->get('/leads', [Leads::class, 'list']);
$router->post('/leads', [Leads::class, 'create']);
$router->get('/leads/export', [Leads::class, 'export']);
$router->get('/leads/tags', [Leads::class, 'tags']);
$router->post('/leads/bulk-delete', [Leads::class, 'bulkDelete']);
$router->get('/leads/{id}', [Leads::class, 'show']);
$router->patch('/leads/{id}', [Leads::class, 'update']);
$router->delete('/leads/{id}', [Leads::class, 'delete']);
$router->post('/leads/{id}/move', [Leads::class, 'move']);
$router->post('/leads/{id}/notes', [Leads::class, 'addNote']);
$router->delete('/leads/{id}/notes/{noteId}', [Leads::class, 'deleteNote']);

// --- CRM
$router->get('/contacts', [Crm::class, 'contacts']);
$router->post('/contacts', [Crm::class, 'createContact']);
$router->patch('/contacts/{id}', [Crm::class, 'updateContact']);
$router->delete('/contacts/{id}', [Crm::class, 'deleteContact']);
$router->get('/activities', [Crm::class, 'activities']);
$router->post('/activities', [Crm::class, 'createActivity']);
$router->delete('/activities/{id}', [Crm::class, 'deleteActivity']);
$router->get('/tasks', [Crm::class, 'tasks']);
$router->post('/tasks', [Crm::class, 'createTask']);
$router->patch('/tasks/{id}', [Crm::class, 'updateTask']);
$router->delete('/tasks/{id}', [Crm::class, 'deleteTask']);
$router->get('/follow-ups', [Crm::class, 'followUps']);
$router->post('/follow-ups', [Crm::class, 'createFollowUp']);
$router->patch('/follow-ups/{id}', [Crm::class, 'updateFollowUp']);
$router->delete('/follow-ups/{id}', [Crm::class, 'deleteFollowUp']);
$router->get('/calendar', [Crm::class, 'calendar']);
$router->post('/calendar/events', [Crm::class, 'createEvent']);
$router->patch('/calendar/events/{id}', [Crm::class, 'updateEvent']);
$router->delete('/calendar/events/{id}', [Crm::class, 'deleteEvent']);
$router->get('/email-templates', [Crm::class, 'templates']);
$router->post('/email-templates', [Crm::class, 'createTemplate']);
$router->patch('/email-templates/{id}', [Crm::class, 'updateTemplate']);
$router->delete('/email-templates/{id}', [Crm::class, 'deleteTemplate']);

// --- audits
$router->get('/audits', [Audit::class, 'list']);
$router->post('/audits', [Audit::class, 'run']);
$router->get('/audits/{id}', [Audit::class, 'show']);
$router->delete('/audits/{id}', [Audit::class, 'delete']);

// --- analytics & notifications
$router->get('/dashboard', [Analytics::class, 'dashboard']);
$router->get('/analytics', [Analytics::class, 'analytics']);
$router->get('/notifications', [Notifications::class, 'list']);
$router->post('/notifications/read-all', [Notifications::class, 'markAll']);
$router->post('/notifications/{id}/read', [Notifications::class, 'markRead']);
$router->delete('/notifications/{id}', [Notifications::class, 'delete']);

// Global per-session API throttle.
\LeadForge\Core\RateLimiter::hit('api|' . (session_id() ?: ($_SERVER['REMOTE_ADDR'] ?? '')), 600, 60);

$router->dispatch(Request::capture());
