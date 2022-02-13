<html>
  <head>
    <title>PHP Test</title>
  </head>
  <body>
    <pre><?php
      if ($stdin = fopen('php://stdin', 'r')) {
        echo stream_get_contents($stdin);
        fclose($stdin);
      }
    ?></pre>
  </body>
</html>
