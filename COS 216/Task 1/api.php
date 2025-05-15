<?php
/*
* COS 216 Homework Assignment - PHP API
* Names: [Your Name]
* Student Number: [Your Student Number]
*/

// Database configuration and connection handling
class Config 
{
    private static $dbHost = "wheatley.cs.up.ac.za";
    private static $dbUser = "u24713122"; 
    private static $dbPass = "HKIJTNWCVBVYGHM43GMZT6RYDHQFESFL"; 
    private static $dbName = "u24713122_products"; 
    
    private static $conn = null;
    
    public static function getConnection() 
    {
        if (self::$conn == null) 
        {
            try 
            {
                self::$conn = new mysqli(self::$dbHost, self::$dbUser, self::$dbPass, self::$dbName);
                
                if (self::$conn->connect_error) 
                {
                    throw new Exception("Connection failed: " . self::$conn->connect_error);
                }
            } 
            catch (Exception $e) 
            {
                die("Database connection error: " . $e->getMessage());
            }
        }
        return self::$conn;
    }
    
    public static function closeConnection() 
    {
        if (self::$conn != null) 
        {
            self::$conn->close();
            self::$conn = null;
        }
    }
    
    public static function generateToken($length = 32) 
    {
        return bin2hex(random_bytes($length / 2));
    }
    
    public static function generateSalt($length = 16) 
    {
        return bin2hex(random_bytes($length / 2));
    }
}

// Set headers for API
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// Get request method and route
$method = $_SERVER['REQUEST_METHOD'];
$route = isset($_GET['route']) ? $_GET['route'] : '';
$conn = Config::getConnection();

// Authentication function
function authenticate($conn) {
    if (!isset($_SERVER['PHP_AUTH_USER']) || !isset($_SERVER['PHP_AUTH_PW'])) {
        header('WWW-Authenticate: Basic realm="Authentication required"');
        header('HTTP/1.0 401 Unauthorized');
        echo json_encode(["error" => "Authentication required"]);
        exit;
    }
    
    $username = $_SERVER['PHP_AUTH_USER'];
    $password = $_SERVER['PHP_AUTH_PW'];
    
    $stmt = $conn->prepare("SELECT id, type FROM Users WHERE username = ? AND password = ?");
    $stmt->bind_param("ss", $username, $password);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 0) {
        header('HTTP/1.0 401 Unauthorized');
        echo json_encode(["error" => "Invalid credentials"]);
        exit;
    }
    
    $user = $result->fetch_assoc();
    return $user;
}

// Registration function
function register($conn) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Validate required fields
    if (!isset($data['username']) || !isset($data['password']) || !isset($data['email']) || !isset($data['type'])) {
        echo json_encode(["error" => "Missing required fields"]);
        return;
    }
    
    // Check if username already exists
    $stmt = $conn->prepare("SELECT id FROM Users WHERE username = ?");
    $stmt->bind_param("s", $data['username']);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        echo json_encode(["error" => "Username already exists"]);
        return;
    }
    
    // Validate user type
    $allowedTypes = ['Distributor', 'Customer', 'Courier'];
    if (!in_array($data['type'], $allowedTypes)) {
        echo json_encode(["error" => "Invalid user type. Must be one of: Distributor, Customer, Courier"]);
        return;
    }
    
    // Insert new user
    $stmt = $conn->prepare("INSERT INTO Users (username, password, email, type) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("ssss", $data['username'], $data['password'], $data['email'], $data['type']);
    
    if ($stmt->execute()) {
        echo json_encode([
            "success" => true,
            "user_id" => $conn->insert_id,
            "message" => "User registered successfully"
        ]);
    } else {
        echo json_encode(["error" => "Failed to register user: " . $conn->error]);
    }
}

// Route handling
switch ($route) {
    case 'register':
        if ($method === 'POST') {
            register($conn);
        } else {
            echo json_encode(["error" => "Method not allowed"]);
        }
        break;
        
    case 'login':
        if ($method === 'POST') {
            $user = authenticate($conn);
            echo json_encode([
                "success" => true,
                "user_id" => $user['id'],
                "user_type" => $user['type']
            ]);
        } else {
            echo json_encode(["error" => "Method not allowed"]);
        }
        break;
        
    case 'createOrder':
        if ($method === 'POST') {
            $user = authenticate($conn);
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Validate required fields
            if (!isset($data['order_id']) || !isset($data['latitude']) || !isset($data['longitude']) || !isset($data['products'])) {
                echo json_encode(["error" => "Missing required fields"]);
                break;
            }
            
            // Generate tracking number (CS- + 7 random characters)
            $tracking_num = "CS-" . substr(md5(uniqid()), 0, 7);
            
            // Insert into Orders table
            $stmt = $conn->prepare("INSERT INTO Orders (customer_id, order_id, tracking_num, destination_latitude, destination_longitude, state) VALUES (?, ?, ?, ?, ?, 'Storage')");
            $stmt->bind_param("iisdd", $user['id'], $data['order_id'], $tracking_num, $data['latitude'], $data['longitude']);
            
            if ($stmt->execute()) {
                // Insert products into Orders_Products table
                $order_id = $data['order_id'];
                $success = true;
                
                foreach ($data['products'] as $product) {
                    // Validate product quantity constraint (1-7 items)
                    if ($product['quantity'] < 1 || $product['quantity'] > 7) {
                        echo json_encode(["error" => "Product quantity must be between 1 and 7"]);
                        $success = false;
                        break;
                    }
                    
                    $stmt = $conn->prepare("INSERT INTO Orders_Products (order_id, product_id, quantity) VALUES (?, ?, ?)");
                    $stmt->bind_param("iii", $order_id, $product['id'], $product['quantity']);
                    
                    if (!$stmt->execute()) {
                        $success = false;
                        break;
                    }
                }
                
                if ($success) {
                    echo json_encode([
                        "success" => true, 
                        "tracking_num" => $tracking_num,
                        "message" => "Order created successfully"
                    ]);
                } else {
                    echo json_encode(["error" => "Failed to add products to order"]);
                }
            } else {
                echo json_encode(["error" => "Failed to create order: " . $conn->error]);
            }
        } else {
            echo json_encode(["error" => "Method not allowed"]);
        }
        break;
        
    case 'updateOrder':
        if ($method === 'PUT') {
            $user = authenticate($conn);
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Validate required fields
            if (!isset($data['order_id']) || !isset($data['latitude']) || !isset($data['longitude']) || !isset($data['state'])) {
                echo json_encode(["error" => "Missing required fields"]);
                break;
            }
            
            // Validate state
            $validStates = ['Storage', 'Out_for_delivery', 'Delivered'];
            if (!in_array($data['state'], $validStates)) {
                echo json_encode(["error" => "Invalid state. Must be one of: Storage, Out_for_delivery, Delivered"]);
                break;
            }
            
            $stmt = $conn->prepare("UPDATE Orders SET destination_latitude = ?, destination_longitude = ?, state = ? WHERE order_id = ?");
            $stmt->bind_param("ddsi", $data['latitude'], $data['longitude'], $data['state'], $data['order_id']);
            
            if ($stmt->execute()) {
                echo json_encode([
                    "success" => true,
                    "message" => "Order updated successfully"
                ]);
            } else {
                echo json_encode(["error" => "Failed to update order: " . $conn->error]);
            }
        } else {
            echo json_encode(["error" => "Method not allowed"]);
        }
        break;
        
    case 'getAllOrders':
        if ($method === 'GET') {
            $user = authenticate($conn);
            
            if ($user['type'] === 'Courier') {
                // Couriers see all orders in storage state
                $stmt = $conn->prepare("SELECT o.*, u.username FROM Orders o 
                                        JOIN Users u ON o.customer_id = u.id 
                                        WHERE o.state = 'Storage'");
                $stmt->execute();
            } else {
                // Customers only see their own orders
                $stmt = $conn->prepare("SELECT o.*, u.username FROM Orders o 
                                        JOIN Users u ON o.customer_id = u.id 
                                        WHERE o.customer_id = ? AND o.state = 'Storage'");
                $stmt->bind_param("i", $user['id']);
                $stmt->execute();
            }
            
            $result = $stmt->get_result();
            $orders = [];
            
            while ($row = $result->fetch_assoc()) {
                // For each order, fetch the associated products
                $order_id = $row['order_id'];
                $products_stmt = $conn->prepare("SELECT p.*, op.quantity FROM Products p 
                                               JOIN Orders_Products op ON p.id = op.product_id 
                                               WHERE op.order_id = ?");
                $products_stmt->bind_param("i", $order_id);
                $products_stmt->execute();
                $products_result = $products_stmt->get_result();
                
                $products = [];
                while ($product = $products_result->fetch_assoc()) {
                    $products[] = $product;
                }
                
                $row['products'] = $products;
                $orders[] = $row;
            }
            
            echo json_encode([
                "success" => true, 
                "orders" => $orders
            ]);
        } else {
            echo json_encode(["error" => "Method not allowed"]);
        }
        break;
        
    case 'createDrone':
        if ($method === 'POST') {
            $user = authenticate($conn);
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Validate required fields
            if (!isset($data['latitude']) || !isset($data['longitude'])) {
                echo json_encode(["error" => "Missing required fields"]);
                break;
            }
            
            $stmt = $conn->prepare("INSERT INTO Drones (is_available, latest_latitude, latest_longitude, altitude, battery_level) VALUES (true, ?, ?, 0, 100)");
            $stmt->bind_param("dd", $data['latitude'], $data['longitude']);
            
            if ($stmt->execute()) {
                echo json_encode([
                    "success" => true, 
                    "drone_id" => $conn->insert_id,
                    "message" => "Drone created successfully"
                ]);
            } else {
                echo json_encode(["error" => "Failed to create drone: " . $conn->error]);
            }
        } else {
            echo json_encode(["error" => "Method not allowed"]);
        }
        break;
        
    case 'updateDrone':
        if ($method === 'PUT') {
            $user = authenticate($conn);
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Validate required fields
            if (!isset($data['id']) || !isset($data['is_available']) || !isset($data['latitude']) || 
                !isset($data['longitude']) || !isset($data['altitude']) || !isset($data['battery_level'])) {
                echo json_encode(["error" => "Missing required fields"]);
                break;
            }
            
            // Validate constraints
            if ($data['battery_level'] < 0 || $data['battery_level'] > 100) {
                echo json_encode(["error" => "Battery level must be between 0 and 100"]);
                break;
            }
            
            $stmt = $conn->prepare("UPDATE Drones SET current_operator_id = ?, is_available = ?, latest_latitude = ?, latest_longitude = ?, altitude = ?, battery_level = ? WHERE id = ?");
            
            $operator_id = isset($data['current_operator_id']) ? $data['current_operator_id'] : null;
            $is_available = $data['is_available'] ? 1 : 0;
            
            $stmt->bind_param("iiddddi", $operator_id, $is_available, $data['latitude'], $data['longitude'], $data['altitude'], $data['battery_level'], $data['id']);
            
            if ($stmt->execute()) {
                echo json_encode([
                    "success" => true,
                    "message" => "Drone updated successfully"
                ]);
            } else {
                echo json_encode(["error" => "Failed to update drone: " . $conn->error]);
            }
        } else {
            echo json_encode(["error" => "Method not allowed"]);
        }
        break;
        
    case 'getAllDrones':
        if ($method === 'GET') {
            $user = authenticate($conn);
            
            $stmt = $conn->prepare("SELECT d.*, u.username as operator_name FROM Drones d 
                                   LEFT JOIN Users u ON d.current_operator_id = u.id");
            $stmt->execute();
            $result = $stmt->get_result();
            
            $drones = [];
            while ($row = $result->fetch_assoc()) {
                $drones[] = $row;
            }
            
            echo json_encode([
                "success" => true, 
                "drones" => $drones
            ]);
        } else {
            echo json_encode(["error" => "Method not allowed"]);
        }
        break;
        
    default:
        echo json_encode(["error" => "Invalid route"]);
        break;
}

// Close the database connection
Config::closeConnection();
?>