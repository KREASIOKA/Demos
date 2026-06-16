<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Disable libxml errors to prevent HTML parsing warnings
libxml_use_internal_errors(true);

$channel_url = getenv('CHANNEL_URL') ?: 'https://t.me/s/katalog_kampoeng';

$html = @file_get_contents($channel_url);
if (!$html) {
    echo json_encode(["success" => false, "message" => "Failed to fetch channel data from $channel_url"]);
    exit;
}

$dom = new DOMDocument();
$dom->loadHTML($html);
$xpath = new DOMXPath($dom);

$products = [];
// Find all messages. Usually wrapped in .tgme_widget_message
$messages = $xpath->query("//div[contains(@class, 'tgme_widget_message')]");

foreach ($messages as $msg) {
    $data_post = $msg->getAttribute('data-post'); // e.g., "katalog_kampoeng/123"
    if (!$data_post) continue;
    
    // Extract images
    $images = [];
    $message_ids = [];
    $photo_wraps = $xpath->query(".//a[contains(@class, 'tgme_widget_message_photo_wrap')]", $msg);
    
    foreach ($photo_wraps as $wrap) {
        $style = $wrap->getAttribute('style');
        // Extract URL from background-image:url('...')
        if (preg_match("/background-image:url\('([^']+)'\)/", $style, $matches)) {
            $images[] = $matches[1];
        }
        
        $href = $wrap->getAttribute('href');
        if (preg_match("/\/(\d+)(?:\?|$)/", $href, $matches)) {
            $message_ids[] = (int)$matches[1];
        }
    }
    
    if (empty($message_ids)) {
        if (preg_match("/\/(\d+)$/", $data_post, $matches)) {
            $message_ids[] = (int)$matches[1];
        }
    }

    $text_nodes = $xpath->query(".//div[contains(@class, 'tgme_widget_message_text')]", $msg);
    $raw_text = '';
    if ($text_nodes->length > 0) {
        // Extract text by replacing <br> with newlines to preserve formatting
        $innerHTML = '';
        $children = $text_nodes->item(0)->childNodes;
        foreach ($children as $child) {
            $innerHTML .= $dom->saveHTML($child);
        }
        $raw_text = strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $innerHTML));
    }
    
    // Parse the text into key-value pairs based on standard
    $parsed_data = [
        'id' => explode('/', $data_post)[1] ?? uniqid(),
        'message_ids' => array_values(array_unique($message_ids)),
        'images' => $images,
        'raw_text' => trim($raw_text)
    ];
    
    // Safer parsing using Regex on raw_text, looking for KEY::VALUE
    if (preg_match_all("/([A-Z_]+)::(.+)/", $raw_text, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $key = strtolower(trim($match[1]));
            $val = trim($match[2]);
            $parsed_data[$key] = $val;
        }
    }

    if (isset($parsed_data['nama'])) {
        if (!isset($parsed_data['harga'])) $parsed_data['harga'] = 0;
        $products[] = $parsed_data;
    }
}

// Reverse so newest is first
$products = array_reverse($products);

echo json_encode(["success" => true, "data" => $products]);
?>
