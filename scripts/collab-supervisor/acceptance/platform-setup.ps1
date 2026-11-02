param([ValidateSet('Plan','Apply')][string]$Action='Plan')
$ErrorActionPreference='Stop'
# Stage 1a has no apply backend, including for disposable files.
if($Action -cne 'Plan'){throw 'NOT_APPROVED: setup apply is not implemented'}
@{
    schema=1;synthetic=$true;applied=$false;realResults='UNVERIFIED'
    proposed=@(
        @{path='_supervisor/tools/<reviewed-hash>';capture='original ACL before a separately approved action';intended='read-only reviewed bundle';restore='restore the captured ACL for this exact path only'},
        @{path='_supervisor/approvals';capture='original ACL before a separately approved action';intended='operator-managed bound approvals';restore='restore the captured ACL for this exact path only'}
    )
    nextGate='Reviewed Stage 1b implementation and exact owner action approval'
} | ConvertTo-Json -Depth 8 -Compress
