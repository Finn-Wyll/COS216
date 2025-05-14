<?php
class Database {
    private static $instance = null;
    private $conn;

    private $host = "localhost";
    private $user = "u24754120";        
    private $pass = "Y42TF7S2MILPLPFR4HT77YCLMA2NL6BR"; 
    private $db   = "u24754120_products"; 

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
?>
