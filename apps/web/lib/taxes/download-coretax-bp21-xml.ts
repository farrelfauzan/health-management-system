import { taxReportCoretaxControllerExportBp21V1 } from '#lib/api/generated/tax-reports/tax-reports';
import { saveBlobFile } from '#lib/shared/save-blob-file';

type DownloadCoretaxBp21XmlParams = {
  reportId: string;
  period: string;
};

/**
 * Saves a finalized PPh 21 month as DJP's BP21 v4 XML (P27-T08), for the
 * clinic to import in Coretax. The API audits the download as an export and
 * as an identifier unmask: the file carries every clinician's NPWP or NIK.
 */
export async function downloadCoretaxBp21Xml({
  reportId,
  period,
}: DownloadCoretaxBp21XmlParams): Promise<void> {
  const response = await taxReportCoretaxControllerExportBp21V1(reportId);
  saveBlobFile({ blob: response.data, fileName: `coretax-bp21-${period}-v4.xml` });
}
