<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if (!function_exists('apache_request_headers')) {
    function apache_request_headers() {
        $arh = array();
        $rx_http = '/\AHTTP_/';
        foreach($_SERVER as $key => $val) {
            if( preg_match($rx_http, $key) ) {
                $arh_key = preg_replace($rx_http, '', $key);
                $rx_matches = array();
                $rx_matches = explode('_', $arh_key);
                if( count($rx_matches) > 0 and strlen($arh_key) > 2 ) {
                    foreach($rx_matches as $ak_key => $ak_val) $rx_matches[$ak_key] = ucfirst(strtolower($ak_val));
                    $arh_key = implode('-', $rx_matches);
                }
                $arh[$arh_key] = $val;
            }
        }
        return( $arh );
    }
}

$bot_token = getenv('BOT_TOKEN') ?: '';
$channel_username = getenv('CHANNEL_USERNAME') ?: '';
$dashboard_secret = getenv('DASHBOARD_LOGIN') ?: 'admin123'; // fallback for testing if missing

// Auth check
$auth_key = $_POST['auth_key'] ?? '';
$headers = apache_request_headers();
if (isset($headers['Authorization'])) {
    $auth_key = str_replace('Bearer ', '', $headers['Authorization']);
}

if ($auth_key !== $dashboard_secret) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Unauthorized: Invalid Dashboard Login Key"]);
    exit;
}

$action = $_POST['action'] ?? '';

// Helper to make cURL requests to Telegram
function telegramRequest($method, $data = [], $is_multipart = false) {
    global $bot_token;
    $url = "https://api.telegram.org/bot{$bot_token}/{$method}";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    
    if ($is_multipart) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    } else {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
    }
    
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8); // 8 seconds to prevent serverless timeout
    
    $response = curl_exec($ch);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return ['code' => $httpcode, 'response' => json_decode($response, true)];
}

if ($action === 'add' || $action === 'replace_all') {
    // If replace_all, we first delete the old ones
    if ($action === 'replace_all') {
        $old_ids = isset($_POST['old_message_ids']) ? json_decode($_POST['old_message_ids'], true) : [];
        if (is_array($old_ids) && count($old_ids) > 0) {
            $mh = curl_multi_init();
            $chs = [];
            foreach ($old_ids as $id) {
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, "https://api.telegram.org/bot{$bot_token}/deleteMessage");
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['chat_id' => $channel_username, 'message_id' => $id]));
                curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_multi_add_handle($mh, $ch);
                $chs[] = $ch;
            }
            $running = null;
            do {
                curl_multi_exec($mh, $running);
            } while ($running);
            foreach ($chs as $ch) {
                curl_multi_remove_handle($mh, $ch);
                curl_close($ch);
            }
            curl_multi_close($mh);
        }
    }

    $caption = $_POST['caption'] ?? '';
    
    // Prepare files
    $media = [];
    $post_data = ['chat_id' => $channel_username];
    
    // Check uploaded files. We expect them as image_0, image_1... up to 6
    for ($i = 0; $i < 7; $i++) {
        $file_key = "image_$i";
        if (isset($_FILES[$file_key]) && $_FILES[$file_key]['error'] === UPLOAD_ERR_OK) {
            $post_data[$file_key] = new CURLFile($_FILES[$file_key]['tmp_name'], $_FILES[$file_key]['type'], $_FILES[$file_key]['name']);
            
            $media_item = [
                'type' => 'photo',
                'media' => 'attach://' . $file_key
            ];
            
            // Only attach caption to the very first image in the media group
            if (empty($media)) {
                $media_item['caption'] = $caption;
            }
            
            $media[] = $media_item;
        }
    }
    
    if (empty($media)) {
        echo json_encode(["success" => false, "message" => "No images provided."]);
        exit;
    }
    
    $post_data['media'] = json_encode($media);
    
    $res = telegramRequest('sendMediaGroup', $post_data, true);
    echo json_encode(["success" => $res['code'] === 200, "telegram" => $res]);
    exit;

} elseif ($action === 'delete') {
    $message_ids = isset($_POST['message_ids']) ? json_decode($_POST['message_ids'], true) : [];
    if (!is_array($message_ids) || empty($message_ids)) {
         echo json_encode(["success" => false, "message" => "Invalid message IDs"]);
         exit;
    }
    
    $mh = curl_multi_init();
    $chs = [];
    foreach ($message_ids as $id) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "https://api.telegram.org/bot{$bot_token}/deleteMessage");
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['chat_id' => $channel_username, 'message_id' => $id]));
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_multi_add_handle($mh, $ch);
        $chs[] = $ch;
    }
    
    $running = null;
    do {
        curl_multi_exec($mh, $running);
    } while ($running);
    
    foreach ($chs as $ch) {
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    
    echo json_encode(["success" => true, "message" => "Messages deleted"]);
    exit;

} elseif ($action === 'edit_text') {
    $caption = $_POST['caption'] ?? '';
    $message_id = $_POST['message_id'] ?? 0;
    
    if (!$message_id || !$caption) {
        echo json_encode(["success" => false, "message" => "Missing message ID or caption"]);
        exit;
    }
    
    $res = telegramRequest('editMessageCaption', [
        'chat_id' => $channel_username,
        'message_id' => (int)$message_id,
        'caption' => $caption
    ]);
    
    echo json_encode(["success" => $res['code'] === 200, "telegram" => $res]);
    exit;
}

echo json_encode(["success" => false, "message" => "Unknown action"]);
?>
