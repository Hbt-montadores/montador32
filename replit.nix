{ pkgs }: {
  deps = [
    pkgs.nodejs_20   # versão LTS mais recente
    pkgs.unzip       # já que você instalou antes
  ];
}
