<?php
require 'COS 216/PA1/config.php';
try {
    $db = Database::getInstance()->getConnection();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => $e->getMessage()
    ]);
    exit;
}

$rawData = file_get_contents("php://input");
$data = json_decode($rawData, true);

// get customer if you have api

$getCustomerId = function ($db, $apikey) {
    $stmt = $db->prepare("SELECT id FROM users WHERE api_key = ?");
    $stmt->bind_param("s", $apikey);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows == 0) {
        return false;
    }
    return $result->fetch_assoc()['id'];
};
//register api call

if ($data["type"] == "Register") {
    $requiredFields = ['name', 'surname', 'email', 'password', 'user_type'];
    foreach ($requiredFields as $field) {
        if (empty($data[$field])) {
            http_response_code(400);
            echo json_encode(["status" => "error","timestamp" => time(), "message" => "Missing or empty field: $field"]);
            exit;
        }
    }

    if (!preg_match("/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/", $data['email'])) {
        http_response_code(400);
        echo json_encode(["status" => "error","timestamp" => time(), "message" => "Invalid email format."]);
        exit;
    }

    if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{9,}$/', $data['password'])) {
        http_response_code(400);
        echo json_encode(["status" => "error","timestamp" => time(), "message" => "Password must be longer than 8 characters and contain upper and lower case letters, a digit, and a special character."]);
        exit;
    }

    $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->bind_param("s", $data['email']);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows > 0) {
        http_response_code(409);
        echo json_encode(["status" => "error","timestamp" => time(), "message" => "Email is already registered"]);
        exit;
    } else {
        $api_key = hash_hmac('md5', $data['email'], 'u24754120');
        $hashedPassword = password_hash($data['password'], PASSWORD_DEFAULT);
        $insert = $db->prepare("INSERT INTO users (name, surname, email, password, type, api_key) VALUES (?, ?, ?, ?, ?, ?)");
        $insert->bind_param("ssssss", $data['name'], $data['surname'], $data['email'], $hashedPassword, $data['user_type'], $api_key);

        if ($insert->execute()) {
            http_response_code(200);
            echo json_encode([
                "status" => "success",
                "timestamp" => time(),
                "data" => [
                    "apikey" => $api_key
                ]
            ]);
        } else {
            error_log("Insert error: " . $insert->error);
            http_response_code(500);
            echo json_encode(["status" => "error","timestamp" => time(), "message" => "Registration failed"]);
        }
    }
}

//login

else if($data["type"] == "Login"){
    $email=$data["email"];
    $password = $data['password'];
    $select = $db->prepare("SELECT * FROM  users WHERE email=?");
    if (!$select) {
        http_response_code(500);
        echo json_encode(["status" => "error", "timestamp" => time(), "data" => "Database error (prepare failed)"]);
        exit;
    }
    $select->bind_param("s", $email);
    $select->execute();
    $result = $select->get_result();
    if ($row = $result->fetch_assoc()) {

        if (password_verify($password, $row["password"])) {
            $api_key= $row["api_key"];
            $name= $row["name"];
            $surname= $row["surname"];
            
            http_response_code(200);
            echo json_encode([
                "status" => "success",
                "timestamp" => time(),
                "data" => [
                    "apikey" => $api_key
                ]
                ]);
       
        } else {
            http_response_code(401);
        echo json_encode(["status" => "error", "timestamp" => time(), "data" => "Incorrect login details"]); 
        }
    } else {
        http_response_code(404);
        echo json_encode(["status" => "error", "timestamp" => time(), "data" => "Invalid email "]);
    }



}


//write later

else if($data["type"] == "CreateOrder"){



}
// expected $data
// {
//     apikey:fdfhf
//     type="UpdateOrder",
//     order_id:int,
//     latitude:gfhfhfh,
//     longitude:gdfdgfdgf
//     state:fhfh
// }
else if($data["type"] == "UpdateOrder"){
    //check for apikey
     if (empty($data['apikey'])) {
        http_response_code(400);
        echo json_encode(["status" => "error","timestamp" => time(), "message" => "API key is required"]);
        exit;
    }
    $apikey=$data['apikey'];
    $customer_id=$getCustomerId($db,$apikey);

    //update the order table
    $stmt = $db->prepare("UPDATE Orders SET destination_latitude, destination_longitude, state  VALUES (?, ?, ?) WHERE order_id=? AND customer_id=? ");
    $stmt->bind_param("sssii", $data["latitude"],$data["longitude"],$data["state"],$data["order_id"],$customer_id);

    if ($stmt->execute()) {
            http_response_code(200);
            echo json_encode([
                "status" => "success",
                "timestamp" => time(),
                "data" => [
                    "apikey" => $api_key
                ]
            ]);
        } else {
            error_log("Update error: " . $stmt->error);
            http_response_code(500);
            echo json_encode(["status" => "error","timestamp" => time(), "message" => "Failed to update order"]);
        }



}

// expected $data
// {
//     apikey:fdfhf
//     type="CreateDrone",
//     current_operator_id:int,
//     is_available:true,
//     latitude:gfhfhfh,
//     longitude:gdfdgfdgf,
//     altitude:asddad,
//     battery_level:fhfh
// }

else if($data["type"] == "CreateDrone"){
    $current_operator_id= $data["current_operator_id"];
    $is_available= $data["is_available"];
    $latitude= $data["latitude"];
    $longitude= $data["longitude"];
    $altitude= $data["altitude"];
    $battery_level= $data["battery_level"];
    if(empty($is_available) || empty($latitude) || empty($longitude)|| empty($altitude) || empty($battery_level)){
        http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Missing required api field"]);
            exit;
    }

    $stmt = $db->prepare("INSERT INTO drones (current_operator_id, is_available, latest_latitude, latest_longitude,altitude,battery_level) VALUES (?, ?, ?, ?,?,?)");
    $stmt->bind_param("isssss",$current_operator_id,$latitude,$longitude,$altitude,$battery_level);
    if( $stmt->execute() ){
        http_response_code(200);
        echo json_encode([
            "status" => "success",
            "timestamp" => time(),
            "data" => [
            "apikey" => $api_key
            ]
            ]);
        } else {
            error_log("Insert error: " . $stmt->error);
            http_response_code(500);
            echo json_encode(["status" => "error","timestamp" => time(), "message" => "Failed to create drone"]);
        }


}

else{
     http_response_code(400);
        echo json_encode(["status" => "error", "timestamp" => time(), "data" => "Invalid or missing type value"]);
        exit;
}



?>