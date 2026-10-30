package com.smartlims.laboratory;

import com.smartlims.results.dto.ResultResponse;
import com.smartlims.results.entity.ResultStatus;
import com.smartlims.results.report.ResultReportRenderer;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.DefaultResourceLoader;
import static org.junit.jupiter.api.Assertions.*;

class ReportTypographyTest {
 private ResultResponse publication(String name){
  var id=UUID.randomUUID();var at=Instant.parse("2026-01-01T09:00:00Z");var actor=new ResultResponse.Actor(id,"Synthetic reviewer");
  return new ResultResponse(id,id,id,"ORD-SYNTHETIC","SYN","Synthetic typography test",1,1,ResultStatus.PUBLISHED,true,false,null,null,new ResultResponse.Patient(name,"PAT-SYNTHETIC",LocalDate.of(2000,1,1)),at,actor,at,actor,at,null,List.of(),List.of(),List.of(),at,at,List.of());
 }
 @Test void actualReportUsesJoinedArabicLigaturesInRegularAndBoldText() throws Exception {
  // Finding Arabic Unicode alone also passes for disconnected, incorrect text.
  var renderer=new ResultReportRenderer(new DefaultResourceLoader(),"\u0644\u0627","");
  byte[] bytes=renderer.render(publication("\u0644\u0627"));
  try(var pdf=Loader.loadPDF(bytes)){
   var glyphs=new ArrayList<TextPosition>();var stripper=new PDFTextStripper(){@Override protected void processTextPosition(TextPosition p){glyphs.add(p);super.processTextPosition(p);}};
   stripper.getText(pdf);
   assertEquals(2,glyphs.stream().filter(p->p.getUnicode().equals("\ufefb")||p.getUnicode().equals("\u0644\u0627")).count(),"Both regular and bold lam-alef must be joined");
   for(var page:pdf.getPages())for(var key:page.getResources().getFontNames())assertTrue(page.getResources().getFont(key).isEmbedded());
   String qa=System.getProperty("smartlims.report.qa-dir");if(qa!=null){Path dir=Path.of(qa).toAbsolutePath().normalize();assertTrue(dir.startsWith(Path.of("").toAbsolutePath().normalize()));Files.createDirectories(dir);ImageIO.write(new PDFRenderer(pdf).renderImageWithDPI(0,120),"png",dir.resolve("qa-typography.png").toFile());}
  }
 }
 @Test void suppliedLocalLogoAndIdentityAreUsedAndRemoteResourcesAreRejected(@TempDir Path dir) throws Exception {
  Path logo=dir.resolve("supplied.png");ImageIO.write(new BufferedImage(20,20,BufferedImage.TYPE_INT_RGB),"png",logo.toFile());
  var renderer=new ResultReportRenderer(new DefaultResourceLoader(),"Supplied synthetic laboratory",logo.toUri().toString());
  try(var pdf=Loader.loadPDF(renderer.render(publication("Synthetic patient")))){assertTrue(new PDFTextStripper().getText(pdf).contains("Supplied synthetic laboratory"));assertTrue(pdf.getPage(0).getResources().getXObjectNames().iterator().hasNext());}
  assertThrows(IllegalStateException.class,()->new ResultReportRenderer(new DefaultResourceLoader(),"","https://example.invalid/logo.png"));
  Path invalid=dir.resolve("invalid.png");Files.writeString(invalid,"not an image");assertThrows(IllegalStateException.class,()->new ResultReportRenderer(new DefaultResourceLoader(),"",invalid.toUri().toString()));
 }
}
