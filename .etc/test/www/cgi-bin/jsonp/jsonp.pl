# usage:
#   perl jsonp.pl "/absolute/path/to/file.json" "/reqest/url?callback=xxx"

my $argc = @ARGV;
exit 1 if ($argc < 2);

my $json_filepath = $ARGV[0];
my $req_url       = $ARGV[1];
my $fn_name;

exit 2 unless (-e "$json_filepath");

if ($req_url =~ /^.*callback=([^&]+)(?:&.*)?$/i) {
  $fn_name = $1;
}
else {
  exit 3;
}

open (FILE, '<', "$json_filepath") or exit 4;
print $fn_name;
print '(';
print <FILE>;
print ');';
close (FILE);
