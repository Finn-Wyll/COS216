<?php
class Database {
    private static $instance = null;
    private $conn;

    private $host = "localhost";
    private $user = "u24754120";
    private $pass = "Y42TF7S2MILPLPFR4HT77YCLMA2NL6BR";
    private $db   = "u24754120_cos216hw";

    private function __construct() {
        $this->conn = new mysqli($this->host, $this->user, $this->pass, $this->db);

        if ($this->conn->connect_error) {
            throw new Exception("Database connection failed: " . $this->conn->connect_error);
        }
        $this->conn->set_charset("utf8");
    }

    public static function getInstance() {
        if (self::$instance == null) {
            self::$instance = new Database();
        }
        return self::$instance;
    }

    public function getConnection() {
        return $this->conn;
    }
}

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


/**
 * @api {POST} /Register Register a new user
 * @apiDescription Register a new user in the system.
 * @apiParam {string} name User's first name.
 * @apiParam {string} surname User's last name.
 * @apiParam {string} email User's email address.
 * @apiParam {string} password User's password.
 * @apiParam {string} user_type User's type ('Customer' or 'Courier').
 * @apiSampleRequest:
 * {
 * "type": "Register",
 * "name": "John",
 * "surname": "Doe",
 * "email": "john.doe@example.com",
 * "password": "Password123!",
 * "user_type": "Customer"
 * }
 * @apiSuccessExample Response:
 * {
 * "status": "success",
 * "timestamp": 1699854321
 * }
 * @apiErrorExample Error Response:
 * {
 * "status": "error",
 * "timestamp": 1699854321,
 * "message": "Missing or empty field: email"
 * }
 */
if ($data["type"] == "Register") {
    $requiredFields = ['username', 'email', 'password', 'user_type'];
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

    $stmt = $db->prepare("SELECT * FROM Users WHERE email = ?");
    $stmt->bind_param("s", $data['email']);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result->num_rows > 0) {
        http_response_code(409);
        echo json_encode(["status" => "error","timestamp" => time(), "message" => "Email is already registered"]);
        exit;
    } else {
        $hashedPassword = password_hash($data['password'], PASSWORD_DEFAULT);
        $insert = $db->prepare("INSERT INTO Users (username, email, password, type) VALUES (?, ?, ?, ?)");
        $insert->bind_param("ssss", $data['username'], $data['email'], $hashedPassword, $data['user_type']);

        if ($insert->execute()) {
            http_response_code(200);
            echo json_encode([
                "status" => "success",
                "timestamp" => time(),
            ]);
        } else {
            error_log("Insert error: " . $insert->error);
            http_response_code(500);
            echo json_encode(["status" => "error","timestamp" => time(), "message" => "Registration failed"]);
        }
    }
}

/**
 * @api {POST} /Login Login a user
 * @apiDescription Authenticate a user and log them in.
 * @apiParam {string} email User's email address.
 * @apiParam {string} password User's password.
 *
 * @apiSampleRequest:
 * {
 * "type": "Login",
 * "email": "john.doe@example.com",
 * "password": "Password123!"
 * }
 *
 * @apiSuccessExample Response:
 * {
 * "status": "success",
 * "timestamp": 1699854789
 * }
 *
 * @apiErrorExample Error Response:
 * {
 * "status": "error",
 * "timestamp": 1699854789,
 * "data": "Incorrect login details"
 * }
 */
else if($data["type"] == "Login"){
    $email=$data["email"];
    $password = $data['password'];
    $select = $db->prepare("SELECT * FROM  Users WHERE email=?");
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
            $name= $row["name"];
            $surname= $row["surname"];

            http_response_code(200);
            echo json_encode([
                "status" => "success",
                "timestamp" => time(),
                "id"=>$row["id"]
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

/**
 * @api {POST} /CreateOrder Create a new order
 * @apiDescription Create a new order for a delivery.
 * @apiParam {float} destination_latitude Latitude of the destination.
 * @apiParam {float} destination_longitude Longitude of the destination.
 *
 * @apiSampleRequest:
 * {
 * "type": "CreateOrder",
 * "customer_id":"4",
 * "order_id":1,
 * "destination_latitude": -26.123456,
 * "destination_longitude": 28.123456
 * }
 *
 * @apiSuccessExample Response:
 * {
 * "status": "success",
 * "timestamp": 1699854900,
 * "message": "Order created successfully",
 * "data": {
 * "order_id": 123,
 * "tracking_num": "CS-abcdef12"
 * }
 * }
 *
 * @apiErrorExample Error Response:
 * {
 * "status": "error",
 * "timestamp": 1699854900,
 * "message": "Missing  destination_latitude or destination_longitude"
 * }
 */
else if($data["type"] == "CreateOrder"){
    $destination_latitude = $data["destination_latitude"];
      $destination_longitude= $data["destination_longitude"];
      $customer_id=$data["customer_id"];
      $order_id=$data["order_id"];

    if (empty($destination_latitude) || empty($destination_longitude)||empty($customer_id)) {
        http_response_code(400);
        echo json_encode(["status" => "error","timestamp" => time(), "message" => "Missing  required field"]);
        exit;
    }
     // Generate a unique tracking number
    $tracking_num = "CS-" . substr(md5(uniqid()), 0, 8);

    // Set the initial state
    $state = "Storage";
     $delivery_date = null;

    $stmt = $db->prepare("INSERT INTO Orders ( customer_id,order_id, tracking_num, destination_latitude, destination_longitude, state, delivery_date) VALUES ( ?,?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("iisddss",  $customer_id,$order_id, $tracking_num, $destination_latitude, $destination_longitude, $state,$delivery_date);

     if ($stmt->execute()) {
            $order_id = $stmt->insert_id;
            http_response_code(200);
            echo json_encode([
                "status" => "success",
                "timestamp" => time(),
                "message" => "Order created successfully",
                "data" => [
                    "order_id" => $order_id,
                    "tracking_num" => $tracking_num
                ]
            ]);
        } else {
            error_log("Insert error: " . $stmt->error);
            http_response_code(500);
            echo json_encode(["status" => "error","timestamp" => time(), "message" => "Failed to create order: ".$stmt->error]);
        }



}

/**
 * @api {POST} /UpdateOrder Update an existing order
 * @apiDescription Update the details of an existing order.
 * @apiParam {int} order_id ID of the order to update.
 * @apiParam {float} latitude New latitude of the destination.
 * @apiParam {float} longitude New longitude of the destination.
 * @apiParam {string} state New state of the order.
 *
 * @apiSampleRequest:
 * {
 * "type": "UpdateOrder",
 * "order_id": 123,
 * "latitude": -26.234567,
 * "longitude": 28.234567,
 * "state": "OutForDelivery"
 * }
 *
 * @apiSuccessExample Response:
 * {
 * "status": "success",
 * "timestamp": 1699855020,
 * "message": "Order updated successfully"
 * }
 *
 * @apiErrorExample Error Response:
 * {
 * "status": "error",
 * "timestamp": 1699855020,
 * "message": "Missing order_id, latitude, longitude, or state"
 * }
 */
else if($data["type"] == "UpdateOrder"){
     $order_id = $data["order_id"];
      $latitude = $data["latitude"];
       $longitude = $data["longitude"];
        $state = $data["state"];
    if (empty($order_id) || empty($latitude) || empty($longitude) || empty($state)) {
        http_response_code(400);
        echo json_encode(["status" => "error","timestamp" => time(), "message" => "Missing order_id, latitude, longitude, or state"]);
        exit;
    }


    $stmt = $db->prepare("UPDATE Orders SET destination_latitude = ?, destination_longitude = ?, state = ? WHERE order_id = ? ");
    $stmt->bind_param("ssdi", $latitude, $longitude, $state, $order_id);

    if ($stmt->execute()) {
        http_response_code(200);
        echo json_encode([
            "status" => "success",
            "timestamp" => time(),
            "message"=> "Order updated successfully"
        ]);
    } else {
        error_log("Update error: " . $stmt->error);
        http_response_code(500);
        echo json_encode(["status" => "error","timestamp" => time(), "message" => "Failed to update order"]);
    }



}

/**
 * @api {POST} /CreateDrone Create a new drone
 * @apiDescription Register a new drone in the system.
 * @apiParam {int} current_operator_id ID of the operator currently controlling the drone.
 * @apiParam {boolean} is_available Availability status of the drone.
 * @apiParam {float} latitude Current latitude of the drone.
 * @apiParam {float} longitude Current longitude of the drone.
 * @apiParam {float} altitude Current altitude of the drone.
 * @apiParam {float} battery_level Current battery level of the drone.
 *
 * @apiSampleRequest:
 * {
 * "type": "CreateDrone",
 * "current_operator_id": 1,
 * "is_available": 1,
 * "latitude": -26.012345,
 * "longitude": 28.012345,
 * "altitude": 10.5,
 * "battery_level": 95.0
 * }
 *
 * @apiSuccessExample Response:
 * {
 * "status": "success",
 * "timestamp": 1699855140,
 * "message": "Drone created successfully"
 * }
 *
 * @apiErrorExample Error Response:
 * {
 * "status": "error",
 * "timestamp": 1699855140,
 * "message": "Missing required api field"
 * }
 */
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

    $stmt = $db->prepare("INSERT INTO Drones (current_operator_id, is_available, latest_latitude, latest_longitude,altitude,battery_level) VALUES (?, ?, ?, ?,?,?)");
    $stmt->bind_param("iidddi",$current_operator_id,$is_available,$latitude,$longitude,$altitude,$battery_level);
    if( $stmt->execute() ){
        http_response_code(200);
        echo json_encode([
            "status" => "success",
            "timestamp" => time(),
            "message"=> "Drone created successfully"
            ]);
        } else {
            error_log("Insert error: " . $stmt->error);
            http_response_code(500);
            echo json_encode(["status" => "error","timestamp" => time(), "message" => "Failed to create drone"]);
        }


}
/**
 * @api {POST} /UpdateDrone Update an existing drone
 * @apiDescription Update the details of an existing drone.
 * @apiParam {int} drone_id ID of the drone to update.
 * @apiParam {int} current_operator_id ID of the operator currently controlling the drone.
 * @apiParam {boolean} is_available Availability status of the drone.
 * @apiParam {float} latitude Current latitude of the drone.
 * @apiParam {float} longitude Current longitude of the drone.
 * @apiParam {float} altitude Current altitude of the drone.
 * @apiParam {float} battery_level Current battery level of the drone.
 *
 * @apiSampleRequest:
 * {
 * "type": "UpdateDrone",
 * "drone_id": 5,
 * "current_operator_id": 2,
 * "is_available": 0,
 * "latitude": -26.023456,
 * "longitude": 28.023456,
 * "altitude": 12.0,
 * "battery_level": 88.0
 * }
 *
 * @apiSuccessExample Response:
 * {
 * "status": "success",
 * "timestamp": 1699855260,
 * "message": "Drone updated successfully"
 * }
 *
 * @apiErrorExample Error Response:
 * {
 * "status": "error",
 * "timestamp": 1699855260,
 * "message": "Failed to update drone"
 * }
 */
else if ($data["type"] == "UpdateDrone") {
    $drone_id = $data["drone_id"];
    $current_operator_id = $data["current_operator_id"];
    $is_available = $data["is_available"];
    $latitude = $data["latitude"];
    $longitude = $data["longitude"];
    $altitude = $data["altitude"];
    $battery_level = $data["battery_level"];

    if (empty($drone_id) || empty($latitude) || empty($longitude) || empty($altitude) || empty($battery_level)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Missing required api field"]);
        exit;
    }

    $stmt = $db->prepare("UPDATE Drones SET current_operator_id = ?, is_available = ?, latest_latitude = ?, latest_longitude = ?, altitude = ?, battery_level = ? WHERE id = ?");
    $stmt->bind_param("iidddii", $current_operator_id, $is_available, $latitude, $longitude, $altitude, $battery_level, $drone_id);
    if ($stmt->execute()) {
        http_response_code(200);
        echo json_encode([
            "status" => "success",
            "timestamp" => time(),
             "message" => "Drone updated successfully"
        ]);
    } else {
        error_log("Update error: " . $stmt->error);
        http_response_code(500);
        echo json_encode(["status" => "error", "timestamp" => time(), "message" => "Failed to update drone"]);
    }
}

/**
 * @api {POST} /GetAllOrders Get all orders
 * @apiDescription Retrieve all orders, with optional filtering by customer.
 * @apiParam {int} customer_id (Optional) ID of the customer to filter orders.
 *
 * @apiSampleRequest:
 * {
 * "type": "GetAllOrders",
 * "customer_id": 1
 * }
 *
 * @apiSuccessExample Response:
 * {
 * "status": "success",
 * "timestamp": 1699855380,
 * "data": [
 * {
 * "order_id": 1,
 * "customer_id": 1,
 * "tracking_num": "CS-12345678",
 * "destination_latitude": -26.123456,
 * "destination_longitude": 28.123456,
 * "state": "Storage",
 * "delivery_date": null
 * },
 * {
 * "order_id": 2,
 * "customer_id": 1,
 * "tracking_num": "CS-23456789",
 * "destination_latitude": -26.234567,
 * "destination_longitude": 28.234567,
 * "state": "OutForDelivery",
 * "delivery_date": null
 * }
 * ]
 * }
 *
 * @apiErrorExample Error Response:
 * {
 * "status": "error",
 * "timestamp": 1699855380,
 * "data": []
 * }
 */
else if ($data["type"] == "GetAllOrders") {
    $customer_id = $data['customer_id'];

    //get user type
    $stmt = $db->prepare("SELECT type FROM Users WHERE id = ?");
    $stmt->bind_param("i", $customer_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $userType = $result->fetch_assoc()['type'];

    if ($userType == "Courier") {
        $stmt = $db->prepare("SELECT * FROM Orders WHERE state = 'Storage'");
    } else {
        $stmt = $db->prepare("SELECT * FROM Orders WHERE customer_id = ?");
        $stmt->bind_param("i", $customer_id);
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $orders = array();
    while ($row = $result->fetch_assoc()) {
        $orders[] = $row;
    }
    http_response_code(200);
    echo json_encode([
        "status" => "success",
        "timestamp" => time(),
        "data" => $orders
    ]);
}

/**
 * @api {POST} /GetAllDrones Get all drones
 * @apiDescription Retrieve all drones from the system.
 *
 * @apiSampleRequest:
 * {
 * "type": "GetAllDrones"
 * }
 *
 * @apiSuccessExample Response:
 * {
 * "status": "success",
 * "timestamp": 1699855440,
 * "data": [
 * {
 * "id": 1,
 * "current_operator_id": 1,
 * "is_available": true,
 * "latest_latitude": -26.012345,
 * "latest_longitude": 28.012345,
 * "altitude": 10.5,
 * "battery_level": 95
 * },
 * {
 * "id": 2,
 * "current_operator_id": 2,
 * "is_available": false,
 * "latest_latitude": -26.023456,
 * "latest_longitude": 28.023456,
 * "altitude": 12.0,
 * "battery_level": 88.0
 * }
 * ]
 * }
 *
 * @apiErrorExample Error Response:
 * {
 * "status": "success",
 * "timestamp": 1699855440,
 * "data": []
 * }
 */
else if ($data["type"] == "GetAllDrones") {
    $stmt = $db->prepare("SELECT * FROM Drones");
    $stmt->execute();
    $result = $stmt->get_result();
    $drones = array();
    while ($row = $result->fetch_assoc()) {
        $drones[] = $row;
    }
    http_response_code(200);
    echo json_encode([
        "status" => "success",
        "timestamp" => time(),
        "data" => $drones
    ]);
}

else{
     http_response_code(400);
        echo json_encode(["status" => "error", "timestamp" => time(), "data" => "Invalid or missing type value"]);
        exit;
}



?>
