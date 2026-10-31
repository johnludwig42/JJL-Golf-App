function Assert-DyeOperator {
    if($env:DYE_A5_OPERATOR -ne '1'){throw 'Operator-only: DYE_A5_OPERATOR=1 is required'}
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    foreach($group in $identity.Groups){
        try{$name=$group.Translate([Security.Principal.NTAccount]).Value}
        catch{throw 'Operator-only: token group inspection incomplete'}
        if($name -match '(^|\\)CodexSandboxUsers$'){throw 'Operator-only: CodexSandboxUsers token refused'}
    }
}
